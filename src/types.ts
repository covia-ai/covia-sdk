import { Agent } from "./Agent";
import { Asset } from "./Asset";
import { Auth } from "./Credentials";
import { Job } from "./Job";
import { Venue } from "./Venue";

export interface VenueOptions {
  baseUrl?: string;
  venueId?: string;
  name?:string;
  description?:string;
  auth?:Auth;
  /** Status observed while connecting — seeds {@link Venue.lastKnownStatus}. */
  status?: StatusData;
}

// Venue Constructor interface (for static members)
export interface VenueConstructor {
  new(): VenueInterface;
  connect(venueId: string | Venue, auth?: Auth):Promise<Venue>;
}

export interface InvokeOptions {
  ucans?: string[];
  /** Execute this run as a memory-only private job. Only supported by `run()`. */
  private?: boolean;
}

/**
 * The venue's operation-execution surface, as the typed managers consume it.
 * `run<T>` returns the operation's result typed as `T` (defaults to `unknown`,
 * so an un-parameterised call stays type-safe rather than leaking `any`).
 */
export interface OperationRunner {
  run<T = unknown>(assetId: string, input?: unknown, options?: InvokeOptions): Promise<T>;
}

export interface VenueInterface {
  baseUrl: string;
  venueId: string;
  metadata: VenueData;
  auth: Auth;

  status():Promise<StatusData>;
  getJob(jobId:string):Promise<Job>;
  listJobs():Promise<string[]>;
  getAsset(assetId: AssetID): Promise<Asset>;
  listAssets(options?: AssetListOptions): Promise<AssetList>;
  didDocument(): Promise<DIDDocument>;
  mcpDiscovery(): Promise<MCPDiscovery>;
  agentCard(): Promise<AgentCard>;
  listSecrets(): Promise<string[]>;
  deleteSecret(name: string): Promise<void>;
  agent(agentId: string): Agent;
  close(): void;

}

export type AssetID = string;

export interface AssetMetadata {
  [key: string]: any;
  name?: string;
  description?: string;
  type?: string;
  created?: string;
  updated?: string;
  operation?: OperationDetails;
  content?: ContentDetails;
  input?: any;
  output?: any;
}

export interface VenueData {
  description?: string;
  name?:string;

}
/** Type for metadata.operation */
export interface OperationDetails {
  [key: string]: any;
  adapter?: string;
  input?: any;
  output?: any;
  steps?: any[];
  result?: any;
}

/** Type for metadata.content */
export interface ContentDetails {
  [key: string]: any;
}

export interface OperationPayload {
  [key: string]: any;
}

export interface ContentHashResult {
  hash: string;
}

export interface JobMetadata {
  id?: string;
  name?:string;
  status?: RunStatus;
  created?: string;
  updated?: string;
  input?: unknown;
  output?: unknown;
  operation?:string;
  caller?: string;
  error?: string;
  [key: string]: unknown;
}

export interface InvokePayload {
  assetId: AssetID;
  payload: OperationPayload;
}

export enum RunStatus {
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
  PENDING = "PENDING",
  STARTED = "STARTED",
  CANCELLED = "CANCELLED",
  TIMEOUT = "TIMEOUT",
  REJECTED = "REJECTED",
  INPUT_REQUIRED= "INPUT_REQUIRED",
  AUTH_REQUIRED = "AUTH_REQUIRED",
  PAUSED = "PAUSED"
}

/** Alias for RunStatus — matches Python SDK naming */
export const JobStatus = RunStatus;
export type JobStatus = RunStatus;

export interface StatusData {
  url?:string;
  ts?:string;
  status?:string;
  did?:string;
  name?:string;
  /** Venue platform version (e.g. "0.3.0"). Absent on venues before 0.3. */
  version?:string;
  stats?:StatsData;

}
export interface StatsData {
  assets?: number;
  users?: number;
  ops?: number;
  jobs?: number;
}
export interface AssetListOptions {
  offset?: number;
  limit?: number;
}

export interface AssetList {
  items: string[];
  total: number;
  offset: number;
  limit: number;
}

// The caller's own per-user a/ namespace (populated by AssetManager.store/
// pin) — a separate bucket from the venue-wide catalog AssetList reads, so
// items carry a name/type/description summary rather than bare id strings.
export interface AssetSummary {
  id: string;
  name?: string;
  type?: string;
  description?: string;
}

export interface MyAssetList {
  items: AssetSummary[];
  total: number;
  offset: number;
  limit: number;
}

export interface MCPDiscovery {
  mcp_version?: string;
  server_url?: string;
  description?: string;
  tools_endpoint?: string;
  endpoint?: Record<string, any> | string;
  [key: string]: any;
}

/**
 * A2A agent card from `GET /.well-known/agent-card.json`.
 * Field names mirror the A2A v1.0 wire format the venue serves (via the
 * official A2A Java SDK). The index signature preserves any spec fields a
 * given venue build adds (e.g. `securitySchemes`, `protocolVersion`).
 */
export interface AgentCard {
  name: string;
  description?: string;
  version?: string;
  provider?: Record<string, any>;
  capabilities?: Record<string, any>;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: Record<string, any>[];
  supportedInterfaces?: Record<string, any>[];
  preferredTransport?: string;
  [key: string]: any;
}

export interface DIDDocument {
  id: string;
  '@context'?: string | string[];
  [key: string]: any;
}

export interface OperationInfo {
  name: string;
  asset: string;
  description?: string;
  input?: any;
  output?: any;
  [key: string]: any;
}

/** A single server-sent event received from a Covia venue. */
export interface SSEEvent {
  event: string | null;
  data: string;
  id: string | null;
  retry: number | null;
  /** Parse the event data as JSON. */
  json: () => unknown;
}

// ── Agent Types ──

export enum AgentStatus {
  SLEEPING = "SLEEPING",
  RUNNING = "RUNNING",
  SUSPENDED = "SUSPENDED",
  TERMINATED = "TERMINATED"
}

export interface AgentCreateInput {
  agentId: string;
  config?: Record<string, any>;
  state?: Record<string, any>;
  overwrite?: boolean;
}

export interface AgentCreateResult {
  agentId: string;
  status: string;
  created: boolean;
  /** True when an existing SLEEPING/SUSPENDED record was updated in place
   *  (mutually exclusive with created). Absent on venues before 0.4. */
  updated?: boolean;
  /** Non-fatal advisories (venue 0.5+): present only when the config looks
   *  misconfigured but create still succeeded — e.g. an Ollama model whose
   *  tool-calling can't be confirmed, or declared tools that don't resolve
   *  on the venue. Each entry is a human-readable message. */
  warnings?: string[];
}

export interface AgentRequestInput {
  agentId: string;
  input?: any;
  wait?: boolean | number;
}

export interface AgentRequestResult {
  id: string;
  status: string;
  output?: any;
}

export interface AgentMessageInput {
  agentId: string;
  message: any;
}

export interface AgentMessageResult {
  agentId: string;
  delivered: boolean;
}

export interface AgentChatInput {
  agentId: string;
  message: any;
  sessionId?: string;
}

export interface AgentChatResult {
  agentId: string;
  sessionId: string;
  response: any;
}

export interface AgentTriggerInput {
  agentId: string;
}

export interface AgentTriggerResult {
  agentId: string;
  status: string;
  result?: any;
  taskResults?: any[];
}

export interface AgentListInput {
  includeTerminated?: boolean;
}

export interface AgentListResult {
  /** Always objects. The invoke op returns enriched entries; the job-free GET
   *  returns bare id strings, which the SDK normalises to `{agentId}` — so
   *  `status`/`tasks` are present only when the venue supplied them. */
  agents: Array<{
    agentId: string;
    status?: string;
    tasks?: number;
  }>;
}

export interface AgentDeleteInput {
  agentId: string;
  remove?: boolean;
}

export interface AgentDeleteResult {
  agentId: string;
  status: string;
  removed?: boolean;
}

export interface AgentSuspendResult {
  agentId: string;
  status: string;
}

export interface AgentRenameSessionResult {
  agentId: string;
  sessionId: string;
  /** Absent when the title was cleared (an omitted/blank title on the call). */
  title?: string;
}

export interface AgentResumeInput {
  agentId: string;
  autoWake?: boolean;
}

export interface AgentUpdateInput {
  agentId: string;
  config?: Record<string, any>;
  state?: Record<string, any>;
}

export interface AgentCancelTaskInput {
  agentId: string;
  taskId: string;
}

export interface AgentInfoResult {
  agentId: string;
  status: string;
  config?: Record<string, any>;
  stateConfig?: Record<string, any>;
  timelineLength?: number;
  tasks?: number;
  error?: string;
}

/** Metadata stored on a conversational agent session. Venues may add fields. */
export interface AgentSessionMetadata {
  id?: string;
  parties?: string[];
  title?: string;
  status?: string;
  created?: number;
  started?: number;
  lastActivity?: number;
  turns?: number;
  turnCount?: number;
  [key: string]: unknown;
}

/** A session record read directly from `g/<agentId>/sessions`. */
export interface AgentSession {
  id: string;
  metadata: AgentSessionMetadata;
  pending: unknown[];
  frames: unknown[];
  wakeTime?: number;
}

export interface AgentSessionListOptions {
  offset?: number;
  limit?: number;
}

export interface AgentSessionPage {
  items: AgentSession[];
  total: number;
  offset: number;
  limit: number;
}

export interface AgentForkInput {
  sourceId: string;
  agentId: string;
  config?: Record<string, any>;
  includeTimeline?: boolean;
  overwrite?: boolean;
}

export interface AgentForkResult {
  agentId: string;
  status: string;
  created: boolean;
  forkedFrom: string;
}

export interface AgentContextInput {
  agentId: string;
  task?: any;
}

export interface AgentCompleteTaskResult {
  agentId: string;
  taskId: string;
  status: string;
}

export interface AgentFailTaskResult {
  agentId: string;
  taskId: string;
  status: string;
}

export interface AssetPinResult {
  path: string;
  hash: string;
}

export interface WorkspaceCopyResult {
  /** 0.3.0 (#147): `false` = copy created a new value at the destination, `true` = it replaced an existing one. */
  existed?: boolean;
  /** 0.3.0: present and true only if a new parent path was built at the destination. */
  pathCreated?: boolean;
}

export interface WorkspaceInspectInput {
  paths: string | string[];
  budget?: number;
  compact?: boolean;
}

export interface WorkspaceInspectResult {
  /** Rendered string for a single path, or a `{path: string}` map for multiple. */
  result: string | Record<string, string>;
}

// ── Workspace Types ──

export interface WorkspaceReadInput {
  path: string;
  maxSize?: number;
}

export interface WorkspaceReadResult {
  exists: boolean;
  value?: any;
  truncated?: boolean;
  /** Convex type name; included on a truncated read (0.3.0) so the caller can
   *  fall back to `list` (map) or `slice` (sequence) instead of guessing. */
  type?: string;
  /** 0.3.0: encoded size in bytes (always present). */
  valueBytes?: number;
}

export interface WorkspaceWriteInput {
  path: string;
  value: any;
}

export interface WorkspaceWriteResult {
  /** 0.3.0 (#147): `false` = a new value was created, `true` = an existing one was replaced (a stored null counts as present). */
  existed?: boolean;
  /** 0.3.0: true iff the write built a new parent path; omitted otherwise. */
  pathCreated?: boolean;
}

export interface WorkspaceDeleteInput {
  path: string;
}

export interface WorkspaceDeleteResult {
  /** 0.3.0 (#147): `true` = a value was present and removed, `false` = idempotent no-op. (Pre-0.3.0 this was a constant `true`, then an empty object.) */
  deleted?: boolean;
}

export interface WorkspaceAppendInput {
  path: string;
  value: any;
}

export interface WorkspaceAppendResult {
  /** 0.3.0 (#147): `false` = a new collection was created, `true` = an existing one was extended. */
  existed?: boolean;
  /** 0.3.0 (#147): the position the appended element landed at (`newSize - 1`). */
  index?: number;
  /** 0.3.0: vector element count after the append. */
  newSize?: number;
  /** 0.3.0: true iff a new parent path was built. */
  pathCreated?: boolean;
}

export interface WorkspaceListInput {
  path?: string;
  limit?: number;
  offset?: number;
}

/** Result of `covia:list` — the direct children of a node. A map lists its
 *  `keys`; sets and vectors report only `type` + `count` (page their elements
 *  with `slice`). */
export interface WorkspaceListResult {
  exists: boolean;
  type: string;
  /** total entries in the collection (the single cardinality word). */
  count?: number;
  /** populated for maps; omitted for sets/vectors/scalars. */
  keys?: string[];
  offset?: number;
}

export interface WorkspaceSliceInput {
  path: string;
  offset?: number;
  limit?: number;
}

export interface WorkspaceSliceResult {
  exists: boolean;
  type?: string;
  values?: any[];
  /** total entries in the collection (the single cardinality word). */
  count?: number;
  offset?: number;
}

/** Job-free tally (#177). `exists` = a countable collection is present at the
 *  path (absent path, or a scalar with nothing to descend into → `{exists:false}`,
 *  no `count`; an empty or too-deep collection → `{exists:true, count:0}`). */
export interface WorkspaceCountResult {
  exists: boolean;
  count?: number;
}
/** One group's metrics in `WorkspaceAggregateResult.groups`. `count` today;
 *  numeric reductions (`sum`/`min`/`max`) will add keys additively. */
export interface GroupCount {
  count?: number;
  [key: string]: number | undefined;
}

export interface WorkspaceAggregateResult {
  exists: boolean;
  count?: number;
  /** Present when `groupBy` was supplied: each distinct field value → a
   *  `GroupCount`. An entry lacking the field groups under the `"null"` key.
   *  Σ(group counts) == count. */
  groups?: Record<string, GroupCount>;
}

// ── Memory Types ──

export interface MemoryEntry {
  /** 1-based position used by the venue memory mutation operation. */
  number: number;
  text: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Position affected by a memory mutation and the resulting list size. */
export interface MemoryChange {
  number: number;
  count: number;
}

// ── UCAN Types ──

export interface UCANAttenuation {
  with: string;
  can: string;
}

export interface UCANIssueInput {
  aud: string;
  att: UCANAttenuation[];
  exp: number;
}

/** Result of `ucan:verify` — the diagnostic verdict on a token. */
export interface UCANVerifyResult {
  valid: boolean;
  /** When invalid: a diagnosable reason (expired, bad signature, unparseable, ...). */
  reason?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  /** Delegation hops above this token (0 = a root grant). */
  chainDepth?: number;
  /** The DID that signed the root of the delegation chain. */
  rootIssuer?: string;
  /** Capabilities, each annotated with rootAuthority: owner | venue | refused. */
  att?: Array<UCANAttenuation & { rootAuthority?: string }>;
  /** Present when with/can supplied: whether the token authorises that request. */
  authorises?: boolean;
  [key: string]: unknown;
}

export interface UCANIssueResult {
  /** The issued delegation token — pass as an element of the `ucans` array on
   *  subsequent invokes. */
  token: string;
  [key: string]: unknown;
}

// ── Secret Types ──

export interface SecretSetInput {
  name: string;
  value: string;
}

export interface SecretSetResult {
  name: string;
  stored: boolean;
}

export interface SecretExtractInput {
  name: string;
}

export interface SecretExtractResult {
  name: string;
  value: string;
}

// ── Discovery Types ──

export interface FunctionInfo {
  name: string;
  id: string;
  description?: string;
}

export interface FunctionsResult {
  functions: FunctionInfo[];
}

/** Per-adapter summary the venue materialises at `v/info/adapters/<name>`
 *  (OPERATIONS.md §3). */
export interface AdapterInfo {
  name: string;
  description?: string;
  /** Full catalog paths of the adapter's invocable operations
   *  (`v/ops/...`, `v/test/ops/...`), each runnable via `operations.run`. */
  operations: string[];
}

export interface AdaptersResult {
  adapters: AdapterInfo[];
}

export class CoviaError extends Error {
  public code: number | null;

  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = 'CoviaError';
    this.code = code;
    this.message = message;
  }
}

/** Raised when the Covia API returns an error response (4xx/5xx). */
export class GridError extends CoviaError {
  public statusCode: number;
  public responseBody: unknown;

  constructor(statusCode: number, message: string, responseBody: unknown = null) {
    super(`HTTP ${statusCode}: ${message}`, statusCode);
    this.name = 'GridError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/** One failed HTTP request made while resolving/validating a venue connection. */
export interface ConnectionAttempt {
  readonly url: string;
  readonly method: string;
  readonly error: CoviaError;
}

/**
 * Raised when a requested read has no job-free transport on the connected
 * venue. Callers may explicitly invoke the corresponding operation when
 * creating a persisted job is the intended action.
 */
export class UnsupportedVenueFeatureError extends CoviaError {
  constructor(public readonly feature: string) {
    super(
      `The connected venue cannot serve ${feature} without creating a job. ` +
      'Invoke the corresponding operation explicitly if creating a persisted job is intended.',
    );
    this.name = 'UnsupportedVenueFeatureError';
  }
}

export interface CoviaConnectionErrorOptions {
  /** Exact request target for a single transport failure. */
  url?: string;
  /** HTTP method for a single transport failure. */
  method?: string;
  /** Original exception, or the final failed attempt for an aggregate error. */
  cause?: unknown;
  /** Ordered venue base URLs considered by `Venue.connect()`. */
  candidates?: readonly string[];
  /** Ordered failed requests made while validating those candidates. */
  attempts?: readonly ConnectionAttempt[];
}

/**
 * Raised when an HTTP request cannot be made, or when `Venue.connect()` cannot
 * validate any candidate. HTTP responses still use `GridError`; this class is
 * for transport failures and connection-attempt aggregation.
 */
export class CoviaConnectionError extends CoviaError {
  public readonly url: string | null;
  public readonly method: string | null;
  public readonly cause: unknown;
  public readonly candidates: readonly string[];
  public readonly attempts: readonly ConnectionAttempt[];

  constructor(message: string, options: CoviaConnectionErrorOptions = {}) {
    super(message);
    this.name = 'CoviaConnectionError';
    this.url = options.url ?? null;
    this.method = options.method?.toUpperCase() ?? null;
    this.cause = options.cause;
    this.candidates = [...(options.candidates ?? [])];
    this.attempts = [...(options.attempts ?? [])];
  }
}

/**
 * Raised when a known venue address reports a different DID. The instance
 * remains bound to `oldDid`; callers must explicitly reconnect/re-authorise
 * against `newDid` rather than silently continuing under a new identity.
 */
export class VenueIdentityChangedError extends CoviaError {
  constructor(
    public readonly oldDid: string,
    public readonly newDid: string,
    public readonly baseUrl: string,
  ) {
    super(`Venue identity changed at ${baseUrl}: expected ${oldDid}, received ${newDid}`);
    this.name = 'VenueIdentityChangedError';
  }
}

/** Raised when an operation or polling loop times out. */
export class CoviaTimeoutError extends CoviaError {
  constructor(message: string) {
    super(message);
    this.name = 'CoviaTimeoutError';
  }
}

/** Raised when a job finishes with a non-COMPLETE status. */
export class JobFailedError extends CoviaError {
  public jobData: JobMetadata;

  constructor(jobData: JobMetadata) {
    const id = jobData.id ?? 'unknown';
    const status = jobData.status ?? 'unknown';
    let msg = `Job ${id} ${status}`;
    // The venue records the failure reason on the job's own top-level
    // `error` field (Job.fail() on the server), not under `output` — a
    // failed job generally has no output at all. `output.error` is kept as
    // a fallback for adapters that shape their failure that way instead.
    const output = jobData.output;
    const outputErrText =
      output && typeof output === 'object' && 'error' in output
        ? (output as { error?: unknown }).error
        : undefined;
    const errText = typeof jobData.error === 'string' ? jobData.error : outputErrText;
    if (typeof errText === 'string') {
      msg += `: ${errText}`;
    }
    super(msg);
    this.name = 'JobFailedError';
    this.jobData = jobData;
  }
}

/** HTTP 429 from the venue — a rate limit or concurrent-job cap. Carries the
 *  server's Retry-After hint (seconds). Thrown only after the SDK's bounded
 *  automatic retries are exhausted. */
export class RateLimitError extends GridError {
  constructor(message: string, public retryAfterSeconds: number, body?: unknown) {
    super(429, message, body);
    this.name = 'RateLimitError';
  }
}

/** Raised when a requested resource is not found (404). */
export class NotFoundError extends GridError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/** Raised when an asset is not found (404). */
export class AssetNotFoundError extends NotFoundError {
  public assetId: string;

  constructor(assetId: string) {
    super(`Asset not found: ${assetId}`);
    this.name = 'AssetNotFoundError';
    this.assetId = assetId;
  }
}

/** Raised when a job is not found (404). */
export class JobNotFoundError extends NotFoundError {
  public jobId: string;

  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = 'JobNotFoundError';
    this.jobId = jobId;
  }
}

/** Raised when an exact agent-session lookup finds no session. */
export class AgentSessionNotFoundError extends CoviaError {
  constructor(
    public readonly agentId: string,
    public readonly sessionId: string,
  ) {
    super(`Agent session not found: ${agentId}/${sessionId}`, 404);
    this.name = 'AgentSessionNotFoundError';
  }
}
