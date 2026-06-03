import { CoviaError, VenueOptions, VenueData, VenueInterface, AssetID, StatusData, AssetListOptions, AssetList, DIDDocument, MCPDiscovery, AgentCard } from './types';
import { AgentManager } from './AgentManager';
import { JobManager } from './JobManager';
import { AssetManager } from './AssetManager';
import { OperationManager } from './OperationManager';
import { WorkspaceManager } from './WorkspaceManager';
import { UCANManager } from './UCANManager';
import { SecretManager } from './SecretManager';
import { Asset } from './Asset';
import { fetchStreamWithError, fetchWithError } from './Utils';
import { Auth, NoAuth } from './Credentials';
import { Resolver } from 'did-resolver'
import { getResolver } from 'web-did-resolver'
import { Job } from './Job';
import { Agent } from './Agent';

const webResolver = getResolver()
const resolver = new Resolver(webResolver)

export class Venue implements VenueInterface {
  public baseUrl: string;
  public venueId: string;
  public auth: Auth;
  public metadata: VenueData;

  private _agents?: AgentManager;
  private _jobs?: JobManager;
  private _assets?: AssetManager;
  private _operations?: OperationManager;
  private _workspace?: WorkspaceManager;
  private _ucan?: UCANManager;
  private _secrets?: SecretManager;

  get agents(): AgentManager { return this._agents ??= new AgentManager(this); }
  get jobs(): JobManager { return this._jobs ??= new JobManager(this); }
  get assets(): AssetManager { return this._assets ??= new AssetManager(this); }
  get operations(): OperationManager { return this._operations ??= new OperationManager(this); }
  get workspace(): WorkspaceManager { return this._workspace ??= new WorkspaceManager(this); }
  get ucan(): UCANManager { return this._ucan ??= new UCANManager(this); }
  get secrets(): SecretManager { return this._secrets ??= new SecretManager(this); }

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
      return new Venue({
        baseUrl: venueId.baseUrl,
        venueId: venueId.venueId,
        name: venueId.metadata.name,
        auth: auth
      });
    }

    if (typeof venueId === 'string') {
      let baseUrl: string;
      if (venueId.startsWith('http:') || venueId.startsWith('https:')) {
        baseUrl = venueId;
        if(baseUrl.endsWith("/"))
          baseUrl = baseUrl.substring(0, baseUrl.length - 1);

      } else if (venueId.startsWith('did:web:')) {
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
   * Get asset by ID (convenience delegate to venue.assets.get)
   * @param assetId - Asset identifier
   * @returns {Promise<Asset>} Returns either an Operation or DataAsset based on the asset's metadata
   */
  async getAsset(assetId: AssetID): Promise<Asset> {
    return this.assets.get(assetId);
  }

  /**
   * List assets with pagination support (convenience delegate to venue.assets.list)
   * @param options - Pagination options (offset, limit)
   * @returns {Promise<AssetList>} Paginated list of asset IDs with metadata
   */
  async listAssets(options: AssetListOptions = {}): Promise<AssetList> {
    return this.assets.list(options);
  }

  /**
   * List all jobs
   * @returns {Promise<string[]>}
   */
  async listJobs(): Promise<string[]> {
    return this.jobs.list();
  }

  /**
   * Get job by ID
   * @param jobId - Job identifier
   * @returns {Promise<Job>}
   */
  async getJob(jobId: string): Promise<Job> {
    return this.jobs.get(jobId);
  }

  /**
   * Get a lazy Agent handle for the given agent ID.
   * No network round-trip — the agent is not verified to exist.
   * @param agentId - Agent identifier
   * @returns {Agent} An Agent instance bound to this venue
   */
  agent(agentId: string): Agent {
    return new Agent(agentId, this);
  }

  /**
   * List secret names
   * @returns {Promise<string[]>}
   */
  async listSecrets(): Promise<string[]> {
    const result = await fetchWithError<{ items: string[]; total: number }>(`${this.baseUrl}/api/v1/secrets`, {
      headers: this._buildHeaders(),
    });
    return Array.isArray(result.items) ? result.items : [];
  }

  /**
   * Store a secret value
   * @param name - Secret name
   * @param value - Secret value
   */
  async putSecret(name: string, value: string): Promise<void> {
    await fetchWithError(`${this.baseUrl}/api/v1/secrets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: this._buildHeaders(),
      body: JSON.stringify({ value }),
    });
  }

  /**
   * Delete a secret
   * @param name - Secret name
   */
  async deleteSecret(name: string): Promise<void> {
    await fetchStreamWithError(`${this.baseUrl}/api/v1/secrets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: this._buildHeaders(),
    });
  }

  /**
   * Get venue status
   * @returns {Promise<StatusData>}
   */
  status():Promise<StatusData> {
      return fetchWithError<StatusData>(`${this.baseUrl}/api/v1/status`);
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
   * Close the venue and release resources.
   * Clears cached asset data for this venue.
   */
  close(): void {
    this.assets.clearCache();
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
