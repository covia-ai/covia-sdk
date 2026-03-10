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

export interface VenueInterface {
  baseUrl: string;
  venueId: string;
  metadata: VenueData;
  
  cancelJob(jobId:string):Promise<number>;
  deleteJob(jobId:string):Promise<number>;
  status():Promise<StatusData>;
  getJob(jobId:string):Promise<Job>;
  listJobs():Promise<string[]>;
  getAsset(assetId: AssetID): Promise<Asset>;
  register(assetData: any): Promise<Asset>;
  getMetadata(assetId:string): Promise<AssetMetadata>;
  readStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> ;
  putContent(assetId:string, content:BodyInit):Promise<ReadableStream<Uint8Array> | null>;
  getContent(assetId:string):Promise<ReadableStream<Uint8Array> | null>;
  run(assetId:string, input:any):Promise<any>;
  invoke(assetId:string, input:any):Promise<Job>;
  listAssets(options?: AssetListOptions): Promise<AssetList>;
  listOperations(): Promise<OperationInfo[]>;
  getOperation(name: string): Promise<OperationInfo>;
  didDocument(): Promise<DIDDocument>;
  mcpDiscovery(): Promise<MCPDiscovery>;
  agentCard(): Promise<AgentCard>;
  streamJobEvents(jobId: string): AsyncGenerator<SSEEvent>;
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

export interface JobMetadata {
  name?:string;
  status?: RunStatus;
  created?: string;
  updated?: string;
  input?: any;
  output?: any;
  op?:string;
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