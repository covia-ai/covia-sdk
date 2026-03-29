import { Job } from './Job';
import {  AssetMetadata, ContentHashResult, RunStatus, VenueInterface, AssetID } from './types';

// Cache for storing asset data
const cache = new Map<AssetID, AssetMetadata>();

export abstract class Asset {
  public id: AssetID;
  public venue: VenueInterface;
  public metadata: AssetMetadata;
  public status?: RunStatus;
  public error?: string;

  constructor(id: AssetID, venue: VenueInterface, metadata: AssetMetadata = {}) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
  }

  /**
   * Get asset metadata
   * @returns {Promise<AssetMetadata>}
   */
  async getMetadata(): Promise<AssetMetadata> {
    if (cache.has(this.id)) {
      return Promise.resolve(cache.get(this.id)!);
    } else {
      const data = this.venue.getMetadata(this.id)
      if (data) {
        cache.set(this.id, data);
      }
      return data;
    }
  }

  /**
   * Read stream from asset
   * @param reader - ReadableStreamDefaultReader
   */
  async readStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    return this.readStream(reader);
  }

  /**
   * Put content to asset
   * @param content - Content to upload
   * @returns {Promise<ContentHashResult>} The content hash returned by the server
   */
  putContent(content: BodyInit): Promise<ContentHashResult> {
    return this.venue.putContent(this.id, content);
  }

  /**
   * Get asset content
   * @returns {Promise<ReadableStream<Uint8Array> | null>}
   */
  getContent(): Promise<ReadableStream<Uint8Array> | null> {
    return this.venue.getContent(this.id);
  }

  /**
   * Get the URL for downloading asset content
   * @returns {string} The URL for downloading the asset content
   */
  getContentURL(): string {
    return `${this.venue.baseUrl}/api/v1/assets/${this.id}/content`;
  }

  /**
   * Execute the operation
   * @param input - Operation input parameters
   * @returns {Promise<any>}
   */
  run(input: any): Promise<any> {

    return this.venue.run( this.id, input);
  }

   /**
   * Execute the operation
   * @param input - Operation input parameters
   * @returns {Promise<any>}
   */
  invoke(input: any): Promise<Job> {

    return this.venue.invoke( this.id, input);
  }
}

