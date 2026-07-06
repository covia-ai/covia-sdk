import { CoviaError, CoviaTimeoutError, GridError, VenueOptions, VenueData, VenueInterface, AssetID, StatusData, AssetListOptions, AssetList, DIDDocument, MCPDiscovery, AgentCard } from './types';
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

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

// True for hosts reachable only locally (loopback, private ranges, mDNS).
// Used to decide the default scheme for schemeless venue inputs.
function hostIsLocal(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  if (/^127\./.test(h)) return true;                      // 127.0.0.0/8 loopback
  if (/^10\./.test(h)) return true;                       // 10.0.0.0/8
  if (/^192\.168\./.test(h)) return true;                 // 192.168.0.0/16
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;  // 172.16.0.0/12
  if (/^169\.254\./.test(h)) return true;                 // link-local
  return false;
}

// Turn a schemeless venue id (bare host / IP / host:port) into the ordered list
// of base URLs to try. The scheme is unspecified here, so a local host may fall
// back across schemes (http then https); public hosts stay https-only.
function schemelessVenueCandidates(venueId: string): string[] {
  const authority = venueId.split('/')[0];
  const v6 = authority.match(/^\[([^\]]+)\]/);
  const host = v6 ? v6[1] : authority.split(':')[0];
  const bare = stripTrailingSlash(venueId);
  return hostIsLocal(host)
    ? [`http://${bare}`, `https://${bare}`]
    : [`https://${bare}`];
}

/**
 * Resolve a non-DID venue id into the ordered list of base URLs that
 * {@link Venue.connect} will try in turn. Explicit `http(s)://` inputs are
 * honoured as given (trailing slash trimmed, single candidate, no fallback);
 * schemeless inputs (bare host / IP / host:port) pick a scheme by host — local
 * hosts (loopback, private ranges, mDNS) try http then https, public hosts stay
 * https-only. `did:*` ids are resolved separately and are not handled here.
 */
export function venueBaseUrlCandidates(venueId: string): string[] {
  if (venueId.startsWith('http:') || venueId.startsWith('https:')) {
    return [stripTrailingSlash(venueId)];
  }
  return schemelessVenueCandidates(venueId);
}

export class Venue implements VenueInterface {
  public baseUrl: string;
  public venueId: string;
  public auth: Auth;
  public metadata: VenueData;

  /**
   * The most recent status this instance has seen — seeded by {@link connect}
   * (which fetches `/api/v1/status` anyway) and refreshed by every
   * {@link status} call. Undefined until one of those has happened, e.g. on a
   * directly constructed venue. Managers use it as a capability hint (venue
   * `version`); it is a cache, not a liveness check.
   */
  public lastKnownStatus?: StatusData;

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
    this.lastKnownStatus = options.status;
    this.metadata = {
        name: options.name || "default",
        description: options.description || ""
    };
  }

  /**
   * Connect to a venue, validating it with `GET {base}/api/v1/status`. If the
   * venue is auth-gated (status answers 401/403 — public access disabled), the
   * venue is validated against its public did:web document at
   * `/.well-known/did.json` instead, whose `id` becomes `venueId` — identity is
   * publicly resolvable by spec even when the API is not.
   *
   * The input is permissive: a full `http(s)://` URL, a bare host / IP /
   * host:port, a `did:web:` id, or an existing Venue instance. Schemeless inputs
   * pick a scheme by host and may fall back across http/https (see
   * {@link venueBaseUrlCandidates}); did:web ids resolve to their `Covia.API.v1`
   * endpoint.
   *
   * @param venueId - A venue URL, DNS name / host:port, `did:web:` id, or existing Venue
   * @param auth - Optional credentials for venue authentication
   * @returns {Promise<Venue>} A connected venue. The actually resolved/validated
   *   target is on the returned object: `venue.baseUrl` is the origin that
   *   responded (the https candidate if an http fallback failed; the resolved
   *   endpoint for a did:web id), and `venue.venueId` is the DID the venue
   *   reported. The validated API root is `${venue.baseUrl}/api/v1`.
   */
  static async connect(venueId: string | Venue, auth?: Auth): Promise<Venue> {

    if (venueId instanceof Venue) {
      return new Venue({
        baseUrl: venueId.baseUrl,
        venueId: venueId.venueId,
        name: venueId.metadata.name,
        auth: auth,
        status: venueId.lastKnownStatus
      });
    }

    if (typeof venueId === 'string') {
      // Resolve the input to one or more candidate base URLs. did:web ids and
      // explicit schemes resolve to a single target (behaviour unchanged); only
      // schemeless inputs may produce a fallback list (see venueBaseUrlCandidates).
      let candidates: string[];
      if (venueId.startsWith('did:web:')) {
        const didDoc = await resolver.resolve(venueId);
        if (!didDoc.didDocument) {
          throw new CoviaError('Invalid DID document');
        }
        const endpoint = didDoc.didDocument.service?.find(service => service.type === 'Covia.API.v1')?.serviceEndpoint;
        if (typeof endpoint !== 'string') {
          throw new CoviaError('No (string) endpoint found for DID');
        }
        candidates = [endpoint.replace(/\/api\/v1/, '')];
      } else {
        candidates = venueBaseUrlCandidates(venueId);
      }

      let lastError: unknown;
      for (const baseUrl of candidates) {
        try {
          const data = await fetchWithError<StatusData>(baseUrl+'/api/v1/status');
          return new Venue({
            baseUrl,
            venueId: data.did,
            name: data.name,
            auth: auth,
            status: data
          });
        } catch (error) {
          // An auth-gated venue (public access disabled) 401s on /status, but its
          // did:web document at /.well-known/did.json is public by spec — identity
          // (DID, public keys, endpoints) is meant to be resolvable anonymously even
          // when the API itself is not. Validate the venue against that instead.
          if (error instanceof GridError && (error.statusCode === 401 || error.statusCode === 403)) {
            try {
              const doc = await fetchWithError<DIDDocument>(baseUrl + '/.well-known/did.json');
              if (doc?.id) {
                return new Venue({ baseUrl, venueId: doc.id, auth: auth });
              }
            } catch { /* fall through to the next candidate with the original error */ }
          }
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new CoviaError(`Could not connect to venue: ${venueId}`);
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
  async status():Promise<StatusData> {
      const data = await fetchWithError<StatusData>(`${this.baseUrl}/api/v1/status`);
      this.lastKnownStatus = data;
      return data;
  }

  /**
   * Block until the venue is ready to serve operations.
   *
   * Polls {@link status} until it responds and reports either no explicit
   * `status` or `"OK"`. Connection/HTTP errors are treated as "not ready yet"
   * and retried until `timeoutMs` elapses — useful right after starting a venue,
   * since a cold venue may answer its root before its invoke layer is up.
   *
   * @param options.timeoutMs - Max time to wait (default 60000).
   * @param options.pollIntervalMs - Delay between polls (default 1000).
   * @returns The ready {@link StatusData}.
   * @throws {CoviaTimeoutError} If the venue is not ready within the timeout.
   */
  async waitUntilReady(options: { timeoutMs?: number; pollIntervalMs?: number } = {}): Promise<StatusData> {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const pollIntervalMs = options.pollIntervalMs ?? 1_000;
    const start = Date.now();
    for (;;) {
      try {
        const data = await this.status();
        if (data.status == null || data.status.toUpperCase() === 'OK') return data;
      } catch {
        // not ready yet — retry until the timeout
      }
      if (Date.now() - start >= timeoutMs) {
        throw new CoviaTimeoutError(`Venue ${this.baseUrl} not ready within ${timeoutMs}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
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
    // Bind auth to this venue's DID (the JWT `aud`), so tokens can't be
    // replayed at another venue and pass the venue's audience check.
    this.auth.apply(headers, this.venueId);
    return headers;
  }
}
