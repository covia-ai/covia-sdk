import { Job } from './Job';
import { AssetMetadata, ContentHashResult, RunStatus, VenueInterface, AssetID, InvokeOptions } from './types';

/** Minimal interface for asset operations from the venue's AssetManager. */
interface AssetOps {
  getMetadata(assetId: string): Promise<AssetMetadata>;
  putContent(assetId: string, content: BodyInit): Promise<ContentHashResult>;
  getContent(assetId: string): Promise<ReadableStream<Uint8Array> | null>;
}

/** Minimal interface for operation execution from the venue's OperationManager. */
interface OpOps {
  run(assetId: string, input: any, options?: InvokeOptions): Promise<any>;
  invoke(assetId: string, input: any, options?: InvokeOptions): Promise<Job>;
}

export abstract class Asset {
  public id: AssetID;
  public venue: VenueInterface;
  public metadata: AssetMetadata;
  public status?: RunStatus;
  public error?: string;
  private _assets: AssetOps;
  private _operations: OpOps;

  constructor(id: AssetID, venue: VenueInterface, metadata: AssetMetadata = {}) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
    this._assets = (venue as unknown as { assets: AssetOps }).assets;
    this._operations = (venue as unknown as { operations: OpOps }).operations;
  }

  /**
   * Get asset metadata
   * @returns {Promise<AssetMetadata>}
   */
  getMetadata(): Promise<AssetMetadata> {
    // Delegate to AssetManager, which caches content-addressed refs correctly
    // and never caches mutable lattice paths (so they can't be served stale).
    return this._assets.getMetadata(this.id);
  }

  /**
   * Put content to asset
   * @param content - Content to upload
   * @returns {Promise<ContentHashResult>} The content hash returned by the server
   */
  putContent(content: BodyInit): Promise<ContentHashResult> {
    return this._assets.putContent(this.id, content);
  }

  /**
   * Get asset content
   * @returns {Promise<ReadableStream<Uint8Array> | null>}
   */
  getContent(): Promise<ReadableStream<Uint8Array> | null> {
    return this._assets.getContent(this.id);
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
    return this._operations.run(this.id, input);
  }

   /**
   * Execute the operation
   * @param input - Operation input parameters
   * @returns {Promise<Job>}
   */
  invoke(input: any): Promise<Job> {
    return this._operations.invoke(this.id, input);
  }
}
