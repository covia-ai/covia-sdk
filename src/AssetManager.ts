import { AssetMetadata, AssetID, AssetListOptions, AssetList, ContentHashResult, NotFoundError, AssetNotFoundError, AssetPinResult, OperationRunner, VenueInterface } from './types';
import { fetchWithError, fetchStreamWithError } from './Utils';
import { assetHash } from './did';
import { getAssetMetadataStore, normaliseHash } from './asset-cache';
import { Asset } from './Asset';
import { Operation } from './Operation';
import { DataAsset } from './DataAsset';

interface AssetManagerVenue {
  baseUrl: string;
  venueId: string;
  auth: { apply(headers: Record<string, string>, audience?: string): void };
  operations: OperationRunner;
}

// Cache for storing asset metadata. `GET /api/v1/assets/{id}` returns the asset
// metadata *directly* as the body (the resolved content id travels in the ETag
// header), so the response body is the AssetMetadata — there is no transport
// envelope to unwrap, and `operation` is a top-level field.
const cache = new Map<AssetID, AssetMetadata>();

export class AssetManager {
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
    if (cache.has(assetId)) {
      return this._wrap(assetId, cache.get(assetId)!);
    }
    // Content-addressed refs are immutable (id = Convex hash of the metadata),
    // so they may also be served from the persistent store — cached once on
    // any venue, valid on every venue, across sessions.
    const hash = assetHash(assetId);
    if (hash) {
      const persisted = getAssetMetadataStore()?.get(normaliseHash(hash));
      if (persisted) {
        cache.set(assetId, persisted);
        return this._wrap(assetId, persisted);
      }
    }
    try {
      const data = await fetchWithError<AssetMetadata>(`${this.venue.baseUrl}/api/v1/assets/${assetId}`);
      // Cache only immutable, content-addressed refs — caching a mutable
      // lattice path (w/…, o/…) would serve stale data after it changes.
      if (hash) {
        cache.set(assetId, data);
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
    return fetchWithError<AssetList>(`${this.venue.baseUrl}/api/v1/assets?${params.toString()}`);
  }

  /**
   * Register a new asset
   * @param assetData - Asset configuration
   */
  async register(assetData: unknown): Promise<Asset> {
    // POST /api/v1/assets returns the new asset's id as a bare (JSON-encoded)
    // string — confirmed against the venue (buildResult(201, id.toHexString()))
    // and the Python SDK — so feeding it straight into get() is correct.
    return fetchWithError<AssetID>(`${this.venue.baseUrl}/api/v1/assets`, {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(assetData),
    }).then(response => this.get(response));
  }

  /**
   * Get asset metadata
   * @param assetId - Asset identifier
   */
  async getMetadata(assetId: string): Promise<AssetMetadata> {
    try {
      return await fetchWithError<AssetMetadata>(`${this.venue.baseUrl}/api/v1/assets/${assetId}`);
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
      return await fetchWithError<ContentHashResult>(`${this.venue.baseUrl}/api/v1/assets/${assetId}/content`, {
        method: 'PUT',
        headers: this._buildHeaders(null),
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
      const response = await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}/content`);
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
    cache.clear();
    getAssetMetadataStore()?.clear();
  }

  // `contentType` defaults to JSON for the metadata/register endpoints. Pass
  // `undefined` for binary content upload so fetch infers the type from the
  // body — forcing application/json would mislabel a Blob/ArrayBuffer/stream.
  private _buildHeaders(contentType: string | null = 'application/json'): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;
    this.venue.auth.apply(headers, this.venue.venueId);
    return headers;
  }
}
