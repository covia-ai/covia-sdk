declare class Job {
    id: string;
    venue: VenueInterface;
    metadata: JobMetadata;
    constructor(id: string, venue: VenueInterface, metadata: JobMetadata);
    /**
     * Whether the job has reached a terminal state
     */
    get isFinished(): boolean;
    /**
     * Whether the job completed successfully
     */
    get isComplete(): boolean;
    /**
     * The job output.
     * @throws {Error} If the job has not finished yet.
     * @throws {JobFailedError} If the job finished with a non-COMPLETE status.
     */
    get output(): any;
    /**
     * Poll the venue for the latest job status.
     * @throws {Error} If the job has no ID.
     */
    refresh(): Promise<void>;
    /**
     * Wait until the job reaches a terminal state.
     * Uses exponential backoff polling (initial 300ms, factor 1.5, max 10s).
     * @param options.timeout - Maximum milliseconds to wait. Undefined waits indefinitely.
     * @throws {CoviaTimeoutError} If timeout is exceeded.
     */
    wait(options?: {
        timeout?: number;
    }): Promise<void>;
    /**
     * Wait for the job to complete and return its output.
     * @param options.timeout - Maximum milliseconds to wait.
     * @returns The job output.
     * @throws {JobFailedError} If the job finishes with a non-COMPLETE status.
     * @throws {CoviaTimeoutError} If timeout is exceeded.
     */
    result(options?: {
        timeout?: number;
    }): Promise<any>;
    /**
     * Stream server-sent events for this job.
     * @returns AsyncGenerator yielding SSEEvent objects
     */
    stream(): AsyncGenerator<SSEEvent>;
    /**
     * Whether the job is paused (PAUSED, INPUT_REQUIRED, or AUTH_REQUIRED)
     */
    get isPaused(): boolean;
    /**
     * Whether the job requires user input
     */
    get needsInput(): boolean;
    /**
     * Whether the job requires authentication
     */
    get needsAuth(): boolean;
    /**
     * Send a message to the running job
     * @param message - Message payload
     * @returns {Promise<any>}
     */
    sendMessage(message: any): Promise<any>;
    /**
     * Pause the job
     * @returns {Promise<JobMetadata>} Updated job metadata
     */
    pause(): Promise<JobMetadata>;
    /**
     * Resume the job
     * @returns {Promise<JobMetadata>} Updated job metadata
     */
    resume(): Promise<JobMetadata>;
    /**
     * Cancels the execution of the job
     * @returns {Promise<JobMetadata>} Updated job metadata
     */
    cancelJob(): Promise<JobMetadata>;
    /**
     * Delete the job
     */
    deleteJob(): Promise<void>;
}

declare abstract class Asset {
    id: AssetID;
    venue: VenueInterface;
    metadata: AssetMetadata;
    status?: RunStatus;
    error?: string;
    constructor(id: AssetID, venue: VenueInterface, metadata?: AssetMetadata);
    /**
     * Get asset metadata
     * @returns {Promise<AssetMetadata>}
     */
    getMetadata(): Promise<AssetMetadata>;
    /**
     * Read stream from asset
     * @param reader - ReadableStreamDefaultReader
     */
    readStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void>;
    /**
     * Put content to asset
     * @param content - Content to upload
     * @returns {Promise<ContentHashResult>} The content hash returned by the server
     */
    putContent(content: BodyInit): Promise<ContentHashResult>;
    /**
     * Get asset content
     * @returns {Promise<ReadableStream<Uint8Array> | null>}
     */
    getContent(): Promise<ReadableStream<Uint8Array> | null>;
    /**
     * Get the URL for downloading asset content
     * @returns {string} The URL for downloading the asset content
     */
    getContentURL(): string;
    /**
     * Execute the operation
     * @param input - Operation input parameters
     * @returns {Promise<any>}
     */
    run(input: any): Promise<any>;
    /**
    * Execute the operation
    * @param input - Operation input parameters
    * @returns {Promise<any>}
    */
    invoke(input: any): Promise<Job>;
}

/**
 * Abstract base class for authentication strategies.
 * Subclass this to implement custom authentication.
 *
 * Example — custom API-key auth:
 *
 *   class ApiKeyAuth extends Auth {
 *     constructor(private key: string) { super(); }
 *     apply(headers: Record<string, string>): void {
 *       headers["X-Api-Key"] = this.key;
 *     }
 *   }
 */
declare abstract class Auth {
    /** Apply authentication credentials to request headers (mutates in place). */
    abstract apply(headers: Record<string, string>): void;
}
/** No-op authentication provider. Sends no credentials. */
declare class NoAuth extends Auth {
    apply(_headers: Record<string, string>): void;
}
/**
 * Bearer token authentication.
 * Adds `Authorization: Bearer <token>` to every request.
 *
 * Example:
 *   const venue = await Grid.connect("https://venue.covia.ai", new BearerAuth("my-token"));
 */
declare class BearerAuth extends Auth {
    private _token;
    constructor(token: string);
    apply(headers: Record<string, string>): void;
}
/**
 * HTTP Basic authentication.
 * Adds `Authorization: Basic <base64(username:password)>` to every request.
 *
 * **Warning:** The Covia venue server does not support Basic authentication.
 * Use {@link BearerAuth} with a JWT token instead for authenticated requests.
 */
declare class BasicAuth extends Auth {
    private _encoded;
    constructor(username: string, password: string);
    apply(headers: Record<string, string>): void;
}
/**
 * Custom auth that sets the X-Covia-User header for user identity tracking.
 *
 * **Warning:** The Covia venue server does not process the X-Covia-User header
 * for authentication. Requests using this auth type will be treated as
 * unauthenticated. Use {@link BearerAuth} with a JWT token instead.
 */
declare class CoviaUserAuth extends Auth {
    private _userId;
    constructor(userId: string);
    apply(headers: Record<string, string>): void;
}
/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, BasicAuth, CoviaUserAuth). */
interface Credentials {
    venueId: string;
    apiKey: string;
    userId: string;
}
/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, BasicAuth, CoviaUserAuth). */
declare class CredentialsHTTP implements Credentials {
    venueId: string;
    apiKey: string;
    userId: string;
    constructor(venueId: string, apiKey: string, userId: string);
}

declare class AgentManager {
    private venue;
    constructor(venue: VenueInterface);
    create(input: AgentCreateInput): Promise<AgentCreateResult>;
    request(agentId: string, input?: any, wait?: boolean | number): Promise<AgentRequestResult>;
    message(agentId: string, message: any): Promise<AgentMessageResult>;
    trigger(agentId: string): Promise<AgentTriggerResult>;
    query(agentId: string): Promise<AgentQueryResult>;
    list(includeTerminated?: boolean): Promise<AgentListResult>;
    delete(agentId: string, remove?: boolean): Promise<AgentDeleteResult>;
    suspend(agentId: string): Promise<AgentSuspendResult>;
    resume(agentId: string, autoWake?: boolean): Promise<AgentSuspendResult>;
    update(input: AgentUpdateInput): Promise<any>;
    cancelTask(agentId: string, taskId: string): Promise<any>;
}

declare class WorkspaceManager {
    private venue;
    constructor(venue: VenueInterface);
    read(path: string, maxSize?: number): Promise<WorkspaceReadResult>;
    write(path: string, value: any): Promise<WorkspaceWriteResult>;
    delete(path: string): Promise<WorkspaceDeleteResult>;
    append(path: string, value: any): Promise<WorkspaceAppendResult>;
    list(path?: string, limit?: number, offset?: number): Promise<WorkspaceListResult>;
    slice(path: string, offset?: number, limit?: number): Promise<WorkspaceSliceResult>;
    functions(): Promise<FunctionsResult>;
    describe(name: string): Promise<any>;
    adapters(): Promise<AdaptersResult>;
}

declare class UCANManager {
    private venue;
    constructor(venue: VenueInterface);
    issue(aud: string, att: UCANAttenuation[], exp: number): Promise<UCANIssueResult>;
}

declare class SecretManager {
    private venue;
    constructor(venue: VenueInterface);
    set(name: string, value: string): Promise<SecretSetResult>;
    /**
     * Extract a secret value by name.
     * NOTE: This operation requires a UCAN capability grant. The backend
     * may reject requests that lack the appropriate capability proof.
     */
    extract(name: string): Promise<SecretExtractResult>;
    list(): Promise<string[]>;
    put(name: string, value: string): Promise<void>;
    delete(name: string): Promise<void>;
}

declare class Venue implements VenueInterface {
    baseUrl: string;
    venueId: string;
    auth: Auth;
    metadata: VenueData;
    private _agents?;
    private _workspace?;
    private _ucan?;
    private _secrets?;
    get agents(): AgentManager;
    get workspace(): WorkspaceManager;
    get ucan(): UCANManager;
    get secrets(): SecretManager;
    constructor(options?: VenueOptions);
    /**
     * Static method to connect to a venue
     * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
     * @param credentials - Optional credentials for venue authentication
     * @returns {Promise<Venue>} A new Venue instance configured appropriately
     */
    static connect(venueId: string | Venue, auth?: Auth): Promise<Venue>;
    /**
     * Register a new asset
     * @param assetData - Asset configuration
     * @returns {Promise<Asset>}
     */
    register(assetData: any): Promise<Asset>;
    /**
     * Read stream from asset
     * @param reader - ReadableStreamDefaultReader
     */
    readStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void>;
    /**
     * Get asset by ID
     * @param assetId - Asset identifier
     * @returns {Promise<Asset>} Returns either an Operation or DataAsset based on the asset's metadata
     */
    getAsset(assetId: AssetID): Promise<Asset>;
    /**
     * List assets with pagination support
     * @param options - Pagination options (offset, limit)
     * @returns {Promise<AssetList>} Paginated list of asset IDs with metadata
     */
    listAssets(options?: AssetListOptions): Promise<AssetList>;
    /**
     * List all jobs
     * @returns {Promise<string[]>}
     */
    listJobs(): Promise<string[]>;
    /**
     * Get job by ID
     * @param jobId - Job identifier
     * @returns {Promise<Job>}
     */
    getJob(jobId: string): Promise<Job>;
    /**
    * Cancel job by ID
    * @param jobId - Job identifier
    * @returns {Promise<JobMetadata>} Updated job metadata
    */
    cancelJob(jobId: string): Promise<JobMetadata>;
    /**
    * Delete job by ID
    * @param jobId - Job identifier
    */
    deleteJob(jobId: string): Promise<void>;
    /**
     * Send a message to a running job
     * @param jobId - Job identifier
     * @param message - Message payload
     * @returns {Promise<any>}
     */
    sendJobMessage(jobId: string, message: any): Promise<any>;
    /**
     * Pause a running job
     * @param jobId - Job identifier
     * @returns {Promise<JobMetadata>} Updated job metadata
     */
    pauseJob(jobId: string): Promise<JobMetadata>;
    /**
     * Resume a paused job
     * @param jobId - Job identifier
     * @returns {Promise<JobMetadata>} Updated job metadata
     */
    resumeJob(jobId: string): Promise<JobMetadata>;
    /**
     * List secret names
     * @returns {Promise<string[]>}
     */
    listSecrets(): Promise<string[]>;
    /**
     * Store a secret value
     * @param name - Secret name
     * @param value - Secret value
     */
    putSecret(name: string, value: string): Promise<void>;
    /**
     * Delete a secret
     * @param name - Secret name
     */
    deleteSecret(name: string): Promise<void>;
    /**
     * Get venue status
     * @returns {Promise<StatusData>}
     */
    status(): Promise<StatusData>;
    /**
     * List all named operations available on this venue
     * @returns {Promise<OperationInfo[]>}
     */
    listOperations(): Promise<OperationInfo[]>;
    /**
     * Get details of a named operation
     * @param name - Operation name (e.g., "test:echo")
     * @returns {Promise<OperationInfo>}
     */
    getOperation(name: string): Promise<OperationInfo>;
    /**
     * Get the full DID document for this venue
     * @returns {Promise<DIDDocument>}
     */
    didDocument(): Promise<DIDDocument>;
    /**
     * Get MCP (Model Context Protocol) discovery information
     * @returns {Promise<MCPDiscovery>}
     */
    mcpDiscovery(): Promise<MCPDiscovery>;
    /**
     * Get the A2A (Agent-to-Agent) agent card
     * @returns {Promise<AgentCard>}
     */
    agentCard(): Promise<AgentCard>;
    /**
     * Get asset metadata
     * @returns {Promise<AssetMetadata>}
     */
    getMetadata(assetId: string): Promise<AssetMetadata>;
    /**
     * Put content to asset
     * @param content - Content to upload
     * @returns {Promise<ContentHashResult>} The content hash returned by the server
     */
    putContent(assetId: string, content: BodyInit): Promise<ContentHashResult>;
    /**
     * Get asset content
     * @returns {Promise<ReadableStream<Uint8Array> | null>}
     */
    getContent(assetId: string): Promise<ReadableStream<Uint8Array> | null>;
    /**
       * Execute the operation
       * @param input - Operation input parameters
       * @returns {Promise<any>}
       */
    run(assetId: string, input: any, options?: InvokeOptions): Promise<any>;
    /**
    * Execute the operation
    * @param input - Operation input parameters
    * @returns {Promise<Job>}
    */
    invoke(assetId: string, input: any, options?: InvokeOptions): Promise<Job>;
    /**
     * Stream server-sent events for a job.
     * @param jobId - Job identifier
     * @returns AsyncGenerator yielding SSEEvent objects
     */
    streamJobEvents(jobId: string): AsyncGenerator<SSEEvent>;
    /**
     * Close the venue and release resources.
     * Clears cached asset data for this venue.
     */
    close(): void;
    /**
     * Disposable support — allows `using venue = await Grid.connect(...)` in TS 5.2+.
     */
    [Symbol.dispose](): void;
    private _buildHeaders;
}

interface VenueOptions {
    baseUrl?: string;
    venueId?: string;
    name?: string;
    description?: string;
    auth?: Auth;
}
interface VenueConstructor {
    new (): VenueInterface;
    connect(venueId: string | Venue, auth?: Auth): Promise<Venue>;
}
interface InvokeOptions {
    ucans?: string[];
}
interface VenueInterface {
    baseUrl: string;
    venueId: string;
    metadata: VenueData;
    cancelJob(jobId: string): Promise<JobMetadata>;
    deleteJob(jobId: string): Promise<void>;
    sendJobMessage(jobId: string, message: any): Promise<any>;
    pauseJob(jobId: string): Promise<JobMetadata>;
    resumeJob(jobId: string): Promise<JobMetadata>;
    status(): Promise<StatusData>;
    getJob(jobId: string): Promise<Job>;
    listJobs(): Promise<string[]>;
    getAsset(assetId: AssetID): Promise<Asset>;
    register(assetData: any): Promise<Asset>;
    getMetadata(assetId: string): Promise<AssetMetadata>;
    readStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void>;
    putContent(assetId: string, content: BodyInit): Promise<ContentHashResult>;
    getContent(assetId: string): Promise<ReadableStream<Uint8Array> | null>;
    run(assetId: string, input: any, options?: InvokeOptions): Promise<any>;
    invoke(assetId: string, input: any, options?: InvokeOptions): Promise<Job>;
    listAssets(options?: AssetListOptions): Promise<AssetList>;
    listOperations(): Promise<OperationInfo[]>;
    getOperation(name: string): Promise<OperationInfo>;
    didDocument(): Promise<DIDDocument>;
    mcpDiscovery(): Promise<MCPDiscovery>;
    agentCard(): Promise<AgentCard>;
    streamJobEvents(jobId: string): AsyncGenerator<SSEEvent>;
    listSecrets(): Promise<string[]>;
    putSecret(name: string, value: string): Promise<void>;
    deleteSecret(name: string): Promise<void>;
    close(): void;
}
type AssetID = string;
interface AssetMetadata {
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
interface VenueData {
    description?: string;
    name?: string;
}
/** Type for metadata.operation */
interface OperationDetails {
    [key: string]: any;
    adapter?: string;
    input?: any;
    output?: any;
    steps?: any[];
    result?: any;
}
/** Type for metadata.content */
interface ContentDetails {
    [key: string]: any;
}
interface OperationPayload {
    [key: string]: any;
}
interface ContentHashResult {
    hash: string;
}
interface JobMetadata {
    name?: string;
    status?: RunStatus;
    created?: string;
    updated?: string;
    input?: any;
    output?: any;
    operation?: string;
    caller?: string;
    error?: string;
    [key: string]: any;
}
interface InvokePayload {
    assetId: AssetID;
    payload: OperationPayload;
}
declare enum RunStatus {
    COMPLETE = "COMPLETE",
    FAILED = "FAILED",
    PENDING = "PENDING",
    STARTED = "STARTED",
    CANCELLED = "CANCELLED",
    TIMEOUT = "TIMEOUT",
    REJECTED = "REJECTED",
    INPUT_REQUIRED = "INPUT_REQUIRED",
    AUTH_REQUIRED = "AUTH_REQUIRED",
    PAUSED = "PAUSED"
}
/** Alias for RunStatus — matches Python SDK naming */
declare const JobStatus: typeof RunStatus;
type JobStatus = RunStatus;
interface StatusData {
    url?: string;
    ts?: string;
    status?: string;
    did?: string;
    name?: string;
    stats?: StatsData;
}
interface StatsData {
    assets?: number;
    users?: number;
    ops?: number;
    jobs?: number;
}
interface AssetListOptions {
    offset?: number;
    limit?: number;
}
interface AssetList {
    items: string[];
    total: number;
    offset: number;
    limit: number;
}
interface MCPDiscovery {
    mcp_version?: string;
    server_url?: string;
    description?: string;
    tools_endpoint?: string;
    endpoint?: Record<string, any> | string;
    [key: string]: any;
}
interface AgentCard {
    agentProvider?: Record<string, any>;
    agentCapabilities?: Record<string, any>;
    agentSkills?: Record<string, any>[];
    agentInterfaces?: Record<string, any>[];
    securityScheme?: Record<string, any>;
    preferredTransport?: Record<string, any>;
    [key: string]: any;
}
interface DIDDocument {
    id: string;
    '@context'?: string | string[];
    [key: string]: any;
}
interface OperationInfo {
    name: string;
    asset: string;
    description?: string;
    input?: any;
    output?: any;
    [key: string]: any;
}
/** A single server-sent event received from a Covia venue. */
interface SSEEvent {
    event: string | null;
    data: string;
    id: string | null;
    retry: number | null;
    /** Parse the event data as JSON. */
    json: () => any;
}
declare enum AgentStatus {
    SLEEPING = "SLEEPING",
    RUNNING = "RUNNING",
    SUSPENDED = "SUSPENDED",
    TERMINATED = "TERMINATED"
}
interface AgentCreateInput {
    agentId: string;
    config?: Record<string, any>;
    state?: Record<string, any>;
    overwrite?: boolean;
}
interface AgentCreateResult {
    agentId: string;
    status: string;
    created: boolean;
}
interface AgentRequestInput {
    agentId: string;
    input?: any;
    wait?: boolean | number;
}
interface AgentRequestResult {
    id: string;
    status: string;
    output?: any;
}
interface AgentMessageInput {
    agentId: string;
    message: any;
}
interface AgentMessageResult {
    agentId: string;
    delivered: boolean;
}
interface AgentTriggerInput {
    agentId: string;
}
interface AgentTriggerResult {
    agentId: string;
    status: string;
    result?: any;
    taskResults?: any[];
}
interface AgentQueryInput {
    agentId: string;
}
interface AgentQueryResult {
    agentId: string;
    status: string;
    state?: Record<string, any>;
    config?: Record<string, any>;
    tasks?: any[];
    [key: string]: any;
}
interface AgentListInput {
    includeTerminated?: boolean;
}
interface AgentListResult {
    agents: Array<{
        agentId: string;
        status: string;
        tasks: number;
    }>;
}
interface AgentDeleteInput {
    agentId: string;
    remove?: boolean;
}
interface AgentDeleteResult {
    agentId: string;
    status: string;
    removed?: boolean;
}
interface AgentSuspendResult {
    agentId: string;
    status: string;
}
interface AgentResumeInput {
    agentId: string;
    autoWake?: boolean;
}
interface AgentUpdateInput {
    agentId: string;
    config?: Record<string, any>;
    state?: Record<string, any>;
}
interface AgentCancelTaskInput {
    agentId: string;
    taskId: string;
}
interface WorkspaceReadInput {
    path: string;
    maxSize?: number;
}
interface WorkspaceReadResult {
    exists: boolean;
    value?: any;
    truncated?: boolean;
    size?: number;
}
interface WorkspaceWriteInput {
    path: string;
    value: any;
}
interface WorkspaceWriteResult {
    written: boolean;
}
interface WorkspaceDeleteInput {
    path: string;
}
interface WorkspaceDeleteResult {
    deleted: boolean;
}
interface WorkspaceAppendInput {
    path: string;
    value: any;
}
interface WorkspaceAppendResult {
    appended: boolean;
}
interface WorkspaceListInput {
    path?: string;
    limit?: number;
    offset?: number;
}
interface WorkspaceListResult {
    exists: boolean;
    type: string;
    count?: number;
    keys?: string[];
    values?: any[];
    offset?: number;
}
interface WorkspaceSliceInput {
    path: string;
    offset?: number;
    limit?: number;
}
interface WorkspaceSliceResult {
    exists: boolean;
    type: string;
    values: any[];
    count: number;
    offset: number;
}
interface UCANAttenuation {
    with: string;
    can: string;
}
interface UCANIssueInput {
    aud: string;
    att: UCANAttenuation[];
    exp: number;
}
interface UCANIssueResult {
    [key: string]: any;
}
interface SecretSetInput {
    name: string;
    value: string;
}
interface SecretSetResult {
    name: string;
    stored: boolean;
}
interface SecretExtractInput {
    name: string;
}
interface SecretExtractResult {
    name: string;
    value: string;
}
interface FunctionInfo {
    name: string;
    id: string;
    description?: string;
}
interface FunctionsResult {
    functions: FunctionInfo[];
}
interface AdapterInfo {
    name: string;
    description?: string;
    operations: string[];
}
interface AdaptersResult {
    adapters: AdapterInfo[];
}
declare class CoviaError extends Error {
    code: number | null;
    constructor(message: string, code?: number | null);
}
/** Raised when the Covia API returns an error response (4xx/5xx). */
declare class GridError extends CoviaError {
    statusCode: number;
    responseBody: any;
    constructor(statusCode: number, message: string, responseBody?: any);
}
/** Raised when the SDK cannot connect to the venue. */
declare class CoviaConnectionError extends CoviaError {
    constructor(message: string);
}
/** Raised when an operation or polling loop times out. */
declare class CoviaTimeoutError extends CoviaError {
    constructor(message: string);
}
/** Raised when a job finishes with a non-COMPLETE status. */
declare class JobFailedError extends CoviaError {
    jobData: JobMetadata;
    constructor(jobData: JobMetadata);
}
/** Raised when a requested resource is not found (404). */
declare class NotFoundError extends GridError {
    constructor(message: string);
}
/** Raised when an asset is not found (404). */
declare class AssetNotFoundError extends NotFoundError {
    assetId: string;
    constructor(assetId: string);
}
/** Raised when a job is not found (404). */
declare class JobNotFoundError extends NotFoundError {
    jobId: string;
    constructor(jobId: string);
}

/**
 * Utility function to handle API calls with consistent error handling
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns {Promise<T>} The response data
 */
declare function fetchWithError<T>(url: string, options?: RequestInit): Promise<T>;
/**
 * Utility function to handle fetch requests that return streams
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
declare function fetchStreamWithError(url: string, options?: RequestInit): Promise<Response>;
/**
 * Utility function to check if job is considered completed
 * @param jobStatus - The status of the job
 * @returns {boolean} - Returns false if job is not completed , else returns true
 */
declare function isJobComplete(jobStatus: RunStatus): boolean;
/**
 * Utility function to check if job is considered paused
 * @param jobStatus - The status of the job
 * @returns {boolean} - Returns false if job is not paused , else returns true
 */
declare function isJobPaused(jobStatus: RunStatus): boolean;
/**
 * Utility function to check if job is considered finished
 * @param jobStatus - The status of the job
 * @returns {boolean} - Returns false if job is not finished , else returns true
 */
declare function isJobFinished(jobStatus: RunStatus): boolean;
/**
 * Utility function to parse the asset hex from the compelte assetId
 * @param assetId - The complete assetId
 * @returns {string} - Returns the parsed hexIdof the asset
 */
declare function getParsedAssetId(assetId: string): string;
/**
 * Utility function to return complete assetId from hex and path
 * @param assetHex - The asset hex
 * @param assetPath - The asset path
 * @returns {string} - Returns the complete assetId
 */
declare function getAssetIdFromPath(assetHex: string, assetPath: string): string;
declare function getAssetIdFromVenueId(assetHex: string, venueId: string): string;
/**
 * Create an SSEEvent object from parsed fields.
 */
declare function createSSEEvent(fields: {
    event?: string;
    data?: string;
    id?: string;
    retry?: number;
}): SSEEvent;
/**
 * Parse an SSE stream from a fetch Response body.
 * Yields SSEEvent objects as they arrive.
 */
declare function parseSSEStream(response: Response): AsyncGenerator<SSEEvent>;

/**
 * Simple logger for the Covia SDK.
 *
 * By default logging is disabled (level = 'none'). Enable debug output with:
 *   import { logger } from '@covia/covia-sdk';
 *   logger.level = 'debug';
 *
 * Or provide a custom log function:
 *   logger.handler = (level, msg) => myLogger.log(level, msg);
 */
type LogLevel = 'debug' | 'none';
type LogHandler = (level: string, message: string) => void;
declare const logger: {
    level: LogLevel;
    handler: LogHandler;
    debug(message: string): void;
};

declare class Grid {
    /**
    * Static method to connect to a venue
    * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
    * @param auth - Optional authentication provider (BearerAuth, BasicAuth, etc.)
    * @returns {Promise<Venue>} A new Venue instance configured appropriately
    */
    static connect(venueId: string, auth?: Auth): Promise<Venue>;
}

declare class Operation extends Asset {
    constructor(id: AssetID, venue: VenueInterface, metadata?: AssetMetadata);
}

declare class DataAsset extends Asset {
    constructor(id: AssetID, venue: VenueInterface, metadata?: AssetMetadata);
}

export { type AdapterInfo, type AdaptersResult, type AgentCancelTaskInput, type AgentCard, type AgentCreateInput, type AgentCreateResult, type AgentDeleteInput, type AgentDeleteResult, type AgentListInput, type AgentListResult, AgentManager, type AgentMessageInput, type AgentMessageResult, type AgentQueryInput, type AgentQueryResult, type AgentRequestInput, type AgentRequestResult, type AgentResumeInput, AgentStatus, type AgentSuspendResult, type AgentTriggerInput, type AgentTriggerResult, type AgentUpdateInput, Asset, type AssetID, type AssetList, type AssetListOptions, type AssetMetadata, AssetNotFoundError, Auth, BasicAuth, BearerAuth, type ContentDetails, type ContentHashResult, CoviaConnectionError, CoviaError, CoviaTimeoutError, CoviaUserAuth, type Credentials, CredentialsHTTP, type DIDDocument, DataAsset, type FunctionInfo, type FunctionsResult, Grid, GridError, type InvokeOptions, type InvokePayload, Job, JobFailedError, type JobMetadata, JobNotFoundError, JobStatus, type MCPDiscovery, NoAuth, NotFoundError, Operation, type OperationDetails, type OperationInfo, type OperationPayload, RunStatus, type SSEEvent, type SecretExtractInput, type SecretExtractResult, SecretManager, type SecretSetInput, type SecretSetResult, type StatsData, type StatusData, type UCANAttenuation, type UCANIssueInput, type UCANIssueResult, UCANManager, Venue, type VenueConstructor, type VenueData, type VenueInterface, type VenueOptions, type WorkspaceAppendInput, type WorkspaceAppendResult, type WorkspaceDeleteInput, type WorkspaceDeleteResult, type WorkspaceListInput, type WorkspaceListResult, WorkspaceManager, type WorkspaceReadInput, type WorkspaceReadResult, type WorkspaceSliceInput, type WorkspaceSliceResult, type WorkspaceWriteInput, type WorkspaceWriteResult, createSSEEvent, fetchStreamWithError, fetchWithError, getAssetIdFromPath, getAssetIdFromVenueId, getParsedAssetId, isJobComplete, isJobFinished, isJobPaused, logger, parseSSEStream };
