import { CoviaError, VenueOptions, VenueData, AssetMetadata, VenueInterface, AssetID, StatusData, OperationInfo, AssetListOptions, AssetList, DIDDocument, MCPDiscovery, AgentCard, NotFoundError, AssetNotFoundError, JobNotFoundError, SSEEvent } from './types';
import { Asset } from './Asset';
import { Operation } from './Operation';
import { DataAsset } from './DataAsset';
import { fetchStreamWithError, fetchWithError, isJobComplete, parseSSEStream } from './Utils';
import { Auth, NoAuth } from './Credentials';
import { Resolver } from 'did-resolver'
import { getResolver } from 'web-did-resolver'
import { Job } from './Job';

const webResolver = getResolver()
const resolver = new Resolver(webResolver)

// Cache for storing asset data
const cache = new Map<AssetID, any>();

export class Venue implements VenueInterface {
  public baseUrl: string;
  public venueId: string;
  public auth: Auth;
  public metadata: VenueData;
  
  constructor(options: VenueOptions = {}) {
    
    
    this.baseUrl = options.baseUrl || '';
    this.venueId = options.venueId || '';
    this.auth = options.auth || new NoAuth();
    this.metadata = {
        name: options.name || "default",
        description: options.description || ""
    };
  }
 
  /**
   * Static method to connect to a venue
   * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
   * @param credentials - Optional credentials for venue authentication
   * @returns {Promise<Venue>} A new Venue instance configured appropriately
   */
  static async connect(venueId: string | Venue, auth?: Auth): Promise<Venue> {

    if (venueId instanceof Venue) {
      // If it's already a Venue instance, return a new instance with the same configuration
      return new Venue({
        baseUrl: venueId.baseUrl,
        venueId: venueId.venueId,
        name: venueId.metadata.name,
        auth: auth
      });
    }

    // If it's a string, determine if it's a URL or DNS name
    if (typeof venueId === 'string') {
      let baseUrl: string;
      // Check if it's a valid HTTP/HTTPS URL
      if (venueId.startsWith('http:') || venueId.startsWith('https:')) {
        baseUrl = venueId;
        //If baseUrl ends with  / remove it
        if(baseUrl.endsWith("/"))
          baseUrl = baseUrl.substring(0, baseUrl.length - 1);
           
      } else if (venueId.startsWith('did:web:')) {
        // Resolve the DID document
        const didDoc = await resolver.resolve(venueId);
        if (!didDoc.didDocument) {
          throw new CoviaError('Invalid DID document');
        }
        const endpoint = didDoc.didDocument.service?.find(service => service.type === 'Covia.API.v1')?.serviceEndpoint;
        if (!endpoint) {
          throw new CoviaError('No endpoint found for DID');
        }
        baseUrl = endpoint.toString().replace(/\/api\/v1/, '');
      } else {
        // Assume it's a DNS name or venue identifier
        baseUrl = `https://${venueId}`;
      }
    const data = await fetchWithError<StatusData>(baseUrl+'/api/v1/status');
    return new Venue({
            baseUrl,
            venueId: data.did,
            name: data.name,
            auth: auth
    });
      
    }

    throw new CoviaError('Invalid venue ID parameter. Must be a string (URL/DNS) or Venue instance.');
  }

  /**
   * Register a new asset
   * @param assetData - Asset configuration
   * @returns {Promise<Asset>}
   */
  async register(assetData: any): Promise<Asset> {
    return fetchWithError<any>(`${this.baseUrl}/api/v1/assets/`, {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(assetData),
    }).then(response=>{return this.getAsset(response)});
  }

  
  /**
   * Read stream from asset
   * @param reader - ReadableStreamDefaultReader
   */
  async readStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      // Process the 'value' (data chunk) here
    }
  }
  
  /**
   * Get asset by ID
   * @param assetId - Asset identifier
   * @returns {Promise<Asset>} Returns either an Operation or DataAsset based on the asset's metadata
   */
  async getAsset(assetId: AssetID): Promise<Asset> {
    if (cache.has(assetId)) {
      const cachedData = cache.get(assetId);
      if (cachedData.metadata?.operation) {
        return new Operation(assetId, this, cachedData);
      } else {
        return new DataAsset(assetId, this, cachedData);
      }
    }
    try {
      const data = await fetchWithError<any>(`${this.baseUrl}/api/v1/assets/${assetId}`);
      cache.set(assetId, data);
      if (data.metadata?.operation) {
        return new Operation(assetId, this, data);
      } else {
        return new DataAsset(assetId, this, data);
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
   * @returns {Promise<AssetList>} Paginated list of asset IDs with metadata
   */
  async listAssets(options: AssetListOptions = {}): Promise<AssetList> {
    const params = new URLSearchParams();
    params.set('offset', String(options.offset ?? 0));
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    return fetchWithError<AssetList>(`${this.baseUrl}/api/v1/assets/?${params.toString()}`);
  }


  /**
   * List all jobs
   * @returns {Promise<string[]>}
   */
  async listJobs(): Promise<string[]> {
    return fetchWithError<string[]>(`${this.baseUrl}/api/v1/jobs`);
  }

  /**
   * Get job by ID
   * @param jobId - Job identifier
   * @returns {Promise<Job>}
   */
  async getJob(jobId: string): Promise<Job> {
    try {
      const data = await fetchWithError<any>(`${this.baseUrl}/api/v1/jobs/${jobId}`);
      return new Job(jobId, this, data);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }

   /**
   * Cancel job by ID
   * @param jobId - Job identifier
   * @returns {Promise<number>}
   */
  async cancelJob(jobId: string):  Promise<number> {
    try {
      const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/jobs/${jobId}/cancel`, { method: 'PUT'});
      return response.status;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }

   /**
   * Delete job by ID
   * @param jobId - Job identifier
   * @returns {Promise<number>}
   */
  async deleteJob(jobId: string):  Promise<number> {
    try {
      const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/jobs/${jobId}/delete`, { method: 'PUT'});
      return response.status;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }


  /**
   * Get venue status
   * @returns {Promise<StatusData>}
   */
  status():Promise<StatusData> {
      return fetchWithError<StatusData>(`${this.baseUrl}/api/v1/status`);
  }

  /**
   * List all named operations available on this venue
   * @returns {Promise<OperationInfo[]>}
   */
  async listOperations(): Promise<OperationInfo[]> {
    return fetchWithError<OperationInfo[]>(`${this.baseUrl}/api/v1/operations`);
  }

  /**
   * Get details of a named operation
   * @param name - Operation name (e.g., "test:echo")
   * @returns {Promise<OperationInfo>}
   */
  async getOperation(name: string): Promise<OperationInfo> {
    return fetchWithError<OperationInfo>(`${this.baseUrl}/api/v1/operations/${name}`);
  }

  /**
   * Get the full DID document for this venue
   * @returns {Promise<DIDDocument>}
   */
  async didDocument(): Promise<DIDDocument> {
    return fetchWithError<DIDDocument>(`${this.baseUrl}/.well-known/did.json`);
  }

  /**
   * Get MCP (Model Context Protocol) discovery information
   * @returns {Promise<MCPDiscovery>}
   */
  async mcpDiscovery(): Promise<MCPDiscovery> {
    return fetchWithError<MCPDiscovery>(`${this.baseUrl}/.well-known/mcp`);
  }

  /**
   * Get the A2A (Agent-to-Agent) agent card
   * @returns {Promise<AgentCard>}
   */
  async agentCard(): Promise<AgentCard> {
    return fetchWithError<AgentCard>(`${this.baseUrl}/.well-known/agent-card.json`);
  }

  
    /**
     * Get asset metadata
     * @returns {Promise<AssetMetadata>}
     */
    async getMetadata(assetId:string): Promise<AssetMetadata> {
      try {
        return await fetchWithError<AssetMetadata>(`${this.baseUrl}/api/v1/assets/${assetId}`);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new AssetNotFoundError(assetId);
        }
        throw error;
      }
    }

  /**
   * Put content to asset
   * @param content - Content to upload
   * @returns {Promise<ReadableStream<Uint8Array> | null>}
   */
  async putContent(assetId:string, content: BodyInit ): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/assets/${assetId}/content`, {
        method: 'PUT',
        headers: this._buildHeaders(),
        body: content,
      });
      return response.body;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }

  /**
   * Get asset content
   * @returns {Promise<ReadableStream<Uint8Array> | null>}
   */
  async getContent(assetId:string): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/assets/${assetId}/content`);
      return response.body;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }

  /**
     * Execute the operation
     * @param input - Operation input parameters
     * @returns {Promise<any>}
     */
    async run(assetId:string,input: any ): Promise<any> {
      const payload = {
        operation: assetId,
        input: input
      };
  
      try {
        const response =   await fetchWithError<any>(`${this.baseUrl}/api/v1/invoke/`, {
          method: 'POST',
          headers: this._buildHeaders(),
          body: JSON.stringify(payload),
        });
        return response?.output;
      } catch (error) {
        throw error;
      }
    }

     /**
     * Execute the operation
     * @param input - Operation input parameters
     * @returns {Promise<Job>}
     */
    async invoke(assetId:string,input: any ): Promise<Job> {
      const payload = {
        operation: assetId,
        input: input
      };
        try {
        const response =   await fetchWithError<any>(`${this.baseUrl}/api/v1/invoke/`, {
          method: 'POST',
          headers: this._buildHeaders(),
          body: JSON.stringify(payload),
        });
        return new Job(response?.id, this, response);
      } catch (error) {
        throw error;
      }
    }

    /**
     * Stream server-sent events for a job.
     * @param jobId - Job identifier
     * @returns AsyncGenerator yielding SSEEvent objects
     */
    async *streamJobEvents(jobId: string): AsyncGenerator<SSEEvent> {
      const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/jobs/${jobId}/sse`, {
        headers: { ...this._buildHeaders(), 'Accept': 'text/event-stream' },
      });
      yield* parseSSEStream(response);
    }

    /**
     * Close the venue and release resources.
     * Clears cached asset data for this venue.
     */
    close(): void {
      cache.clear();
    }

    /**
     * Disposable support — allows `using venue = await Grid.connect(...)` in TS 5.2+.
     */
    [Symbol.dispose](): void {
      this.close();
    }

    private _buildHeaders(): Record<string, string> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      this.auth.apply(headers);
      return headers;
    }
}
