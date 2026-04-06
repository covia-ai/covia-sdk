import { AssetMetadata, AssetID, AssetListOptions, AssetList, ContentHashResult, NotFoundError, AssetNotFoundError } from './types';
import { fetchWithError, fetchStreamWithError } from './Utils';
import { Asset } from './Asset';
import { Operation } from './Operation';
import { DataAsset } from './DataAsset';

interface AssetManagerVenue {
  baseUrl: string;
  auth: { apply(headers: Record<string, string>): void };
}

// Cache for storing asset data
const cache = new Map<AssetID, any>();

export class AssetManager {
  constructor(private venue: AssetManagerVenue) {}

  /**
   * Get asset by ID
   * @param assetId - Asset identifier
   * @returns Returns either an Operation or DataAsset based on the asset's metadata
   */
  async get(assetId: AssetID): Promise<Asset> {
    if (cache.has(assetId)) {
      const cachedData = cache.get(assetId);
      if (cachedData.metadata?.operation) {
        return new Operation(assetId, this.venue as any, cachedData);
      } else {
        return new DataAsset(assetId, this.venue as any, cachedData);
      }
    }
    try {
      const data = await fetchWithError<any>(`${this.venue.baseUrl}/api/v1/assets/${assetId}`);
      cache.set(assetId, data);
      if (data.metadata?.operation) {
        return new Operation(assetId, this.venue as any, data);
      } else {
        return new DataAsset(assetId, this.venue as any, data);
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
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
  async register(assetData: any): Promise<Asset> {
    return fetchWithError<any>(`${this.venue.baseUrl}/api/v1/assets`, {
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
        headers: this._buildHeaders(),
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
   * Clear the asset cache.
   */
  clearCache(): void {
    cache.clear();
  }

  private _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    this.venue.auth.apply(headers);
    return headers;
  }
}
