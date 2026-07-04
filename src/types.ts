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
}

// Venue Constructor interface (for static members)
export interface VenueConstructor {
  new(): VenueInterface;
  connect(venueId: string | Venue, auth?: Auth):Promise<Venue>;
}

export interface InvokeOptions {
  ucans?: string[];
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
  name?:string;
  status?: RunStatus;
  created?: string;
  updated?: string;
  input?: any;
  output?: any;
  operation?:string;
  caller?: string;
  error?: string;
  [key: string]: any;
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

export interface MCPDiscovery {
  mcp_version?: string;
  server_url?: string;
  description?: string;
  tools_endpoint?: string;
  endpoint?: Record<string, any> | string;
  [key: string]: any;
}

export interface AgentCard {
  agentProvider?: Record<string, any>;
  agentCapabilities?: Record<string, any>;
  agentSkills?: Record<string, any>[];
  agentInterfaces?: Record<string, any>[];
  securityScheme?: Record<string, any>;
  preferredTransport?: Record<string, any>;
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
  json: () => any;
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

export interface AgentQueryInput {
  agentId: string;
}

export interface AgentQueryResult {
  agentId: string;
  status: string;
  state?: Record<string, any>;
  config?: Record<string, any>;
  tasks?: any[];
  [key: string]: any;
}

export interface AgentListInput {
  includeTerminated?: boolean;
}

export interface AgentListResult {
  agents: Array<{
    agentId: string;
    status: string;
    tasks: number;
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

export interface UCANIssueResult {
  [key: string]: any;
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

export interface AdapterInfo {
  name: string;
  description?: string;
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
  public responseBody: any;

  constructor(statusCode: number, message: string, responseBody: any = null) {
    super(`HTTP ${statusCode}: ${message}`, statusCode);
    this.name = 'GridError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/** Raised when the SDK cannot connect to the venue. */
export class CoviaConnectionError extends CoviaError {
  constructor(message: string) {
    super(message);
    this.name = 'CoviaConnectionError';
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
    const id = (jobData as any).id ?? 'unknown';
    const status = jobData.status ?? 'unknown';
    let msg = `Job ${id} ${status}`;
    if (jobData.output?.error) {
      msg += `: ${jobData.output.error}`;
    }
    super(msg);
    this.name = 'JobFailedError';
    this.jobData = jobData;
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