import { AssetMetadata, AssetID, AssetListOptions, AssetList, MyAssetList, ContentHashResult, NotFoundError, AssetNotFoundError, AssetPinResult, OperationRunner, VenueInterface } from './types';
import { assetHash } from './did';
import { getAssetMetadataStore, normaliseHash } from './asset-cache';
import { Asset } from './Asset';
import { Operation } from './Operation';
import { DataAsset } from './DataAsset';
import { venueJson, VenueRequestContext, venueStream } from './VenueTransport';

interface AssetManagerVenue extends VenueRequestContext {
  operations: OperationRunner;
}

export class AssetManager {
  // Memory cache is manager/venue-local. Content-addressed metadata may still
  // be shared deliberately through the configured persistent metadata store.
  private cache = new Map<AssetID, AssetMetadata>();

  constructor(private venue: AssetManagerVenue) {}

  /**
   * Get an asset by lattice address.
   *
   * `assetId` may be a content hash (`<hash>`, `a/<hash>`, `<DID>/a/<hash>`) or
   * a mutable lattice path the venue resolves (`w/my-assets/foo`, `o/my-op`,
   * `<DID>/w/...`). Only content-addressed (immutable) refs are cached;
   * mutable paths are always re-fetched, so a changed value is never served stale.
   * @param assetId - Asset identifier or lattice address
   * @returns Returns either an Operation or DataAsset based on the asset's metadata
   */
  async get(assetId: AssetID): Promise<Asset> {
    if (this.cache.has(assetId)) {
      return this._wrap(assetId, this.cache.get(assetId)!);
    }
    // Content-addressed refs are immutable (id = Convex hash of the metadata),
    // so they may also be served from the persistent store — cached once on
    // any venue, valid on every venue, across sessions.
    const hash = assetHash(assetId);
    if (hash) {
      const persisted = getAssetMetadataStore()?.get(normaliseHash(hash));
      if (persisted) {
        this.cache.set(assetId, persisted);
        return this._wrap(assetId, persisted);
      }
    }
    try {
      const data = await venueJson<AssetMetadata>(
        this.venue,
        `/api/v1/assets/${assetId}`,
        { contentType: null },
      );
      // Cache only immutable, content-addressed refs — caching a mutable
      // lattice path (w/…, o/…) would serve stale data after it changes.
      if (hash) {
        this.cache.set(assetId, data);
        getAssetMetadataStore()?.put(normaliseHash(hash), data);
      }
      return this._wrap(assetId, data);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }

  private _wrap(assetId: AssetID, data: AssetMetadata): Asset {
    if (data.operation) {
      return new Operation(assetId, this.venue as unknown as VenueInterface, data);
    }
    return new DataAsset(assetId, this.venue as unknown as VenueInterface, data);
  }

  /**
   * List assets with pagination support
   * @param options - Pagination options (offset, limit)
   */
  async list(options: AssetListOptions = {}): Promise<AssetList> {
    const params = new URLSearchParams();
    params.set('offset', String(options.offset ?? 0));
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    return venueJson<AssetList>(
      this.venue,
      `/api/v1/assets?${params.toString()}`,
      { contentType: null },
    );
  }

  /**
   * List the authenticated caller's own assets — the per-user a/ namespace
   * populated by `store`/`pin`, distinct from the venue-wide catalog `list()`
   * reads. Job-free (a plain GET, not an operation invocation).
   * @param options - Pagination options (offset, limit)
   */
  async listMine(options: AssetListOptions = {}): Promise<MyAssetList> {
    const params = new URLSearchParams();
    params.set('scope', 'own');
    params.set('offset', String(options.offset ?? 0));
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    return venueJson<MyAssetList>(
      this.venue,
      `/api/v1/assets?${params.toString()}`,
      { contentType: null },
    );
  }

  /**
   * Register a new asset
   * @param assetData - Asset configuration
   */
  async register(assetData: unknown): Promise<Asset> {
    // POST /api/v1/assets returns the new asset's id as a bare (JSON-encoded)
    // string — confirmed against the venue (buildResult(201, id.toHexString()))
    // and the Python SDK — so feeding it straight into get() is correct.
    return venueJson<AssetID>(this.venue, '/api/v1/assets', {
      method: 'POST',
      body: JSON.stringify(assetData),
    }).then(response => this.get(response));
  }

  /**
   * Get asset metadata
   * @param assetId - Asset identifier
   */
  async getMetadata(assetId: string): Promise<AssetMetadata> {
    try {
      return await venueJson<AssetMetadata>(
        this.venue,
        `/api/v1/assets/${assetId}`,
        { contentType: null },
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }

  /**
   * Put content to asset
   * @param assetId - Asset identifier
   * @param content - Content to upload
   * @returns The content hash returned by the server
   */
  async putContent(assetId: string, content: BodyInit): Promise<ContentHashResult> {
    try {
      return await venueJson<ContentHashResult>(this.venue, `/api/v1/assets/${assetId}/content`, {
        method: 'PUT',
        contentType: null,
        body: content,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }

  /**
   * Get asset content
   * @param assetId - Asset identifier
   */
  async getContent(assetId: string): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const response = await venueStream(
        this.venue,
        `/api/v1/assets/${assetId}/content`,
        { contentType: null },
      );
      return response.body;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }

  /**
   * Pin a resolvable value into the content-addressed asset store.
   * Idempotent — same value produces the same hash.
   * @param path - Source address (hex hash, /a/<hash>, /o/<name>, /v/<path>, DID URL, or workspace path)
   */
  async pin(path: string): Promise<AssetPinResult> {
    return this.venue.operations.run<AssetPinResult>('v/ops/asset/pin', { path });
  }

  /**
   * Clear the asset cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /** Clear the explicitly configured cross-session metadata store. */
  clearPersistentCache(): void {
    getAssetMetadataStore()?.clear();
  }

}
