declare class Job {
    id: string;
    venue: VenueInterface;
    metadata: JobMetadata;
    private _jobs;
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
     * Cancel the job
     * @returns {Promise<JobMetadata>} Updated job metadata
     */
    cancel(): Promise<JobMetadata>;
    /**
     * Delete the job
     */
    delete(): Promise<void>;
}

declare abstract class Asset {
    id: AssetID;
    venue: VenueInterface;
    metadata: AssetMetadata;
    status?: RunStatus;
    error?: string;
    private _assets;
    private _operations;
    constructor(id: AssetID, venue: VenueInterface, metadata?: AssetMetadata);
    /**
     * Get asset metadata
     * @returns {Promise<AssetMetadata>}
     */
    getMetadata(): Promise<AssetMetadata>;
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
    * @returns {Promise<Job>}
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
 * Ed25519 keypair authentication (self-issued EdDSA JWT).
 * Generates a fresh short-lived JWT for every request, signed with the
 * client's Ed25519 private key.  The server verifies the signature and
 * extracts the caller's DID from the `sub` claim.
 *
 * Example:
 *   const auth = KeyPairAuth.generate();
 *   console.log(auth.getDID()); // did:key:z6Mk...
 *   const venue = await Grid.connect("https://venue.covia.ai", auth);
 */
declare class KeyPairAuth extends Auth {
    private _privateKey;
    private _publicKey;
    private _did;
    private _lifetime;
    /**
     * @param privateKey - 32-byte Ed25519 private key
     * @param tokenLifetimeSeconds - JWT lifetime in seconds (default 300 = 5 min)
     */
    constructor(privateKey: Uint8Array, tokenLifetimeSeconds?: number);
    apply(headers: Record<string, string>): void;
    /** The caller's DID derived from the public key. */
    getDID(): string;
    /** The 32-byte Ed25519 public key. */
    getPublicKey(): Uint8Array;
    /** Generate a new random keypair and return a KeyPairAuth instance. */
    static generate(tokenLifetimeSeconds?: number): KeyPairAuth;
    /** Create from a hex-encoded private key string. */
    static fromHex(privateKeyHex: string, tokenLifetimeSeconds?: number): KeyPairAuth;
}
/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, KeyPairAuth). */
interface Credentials {
    venueId: string;
    apiKey: string;
    userId: string;
}
/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, KeyPairAuth). */
declare class CredentialsHTTP implements Credentials {
    venueId: string;
    apiKey: string;
    userId: string;
    constructor(venueId: string, apiKey: string, userId: string);
}

interface AgentManagerVenue {
    operations: {
        run(assetId: string, input: any): Promise<any>;
    };
}
declare class AgentManager {
    private venue;
    constructor(venue: AgentManagerVenue);
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

interface JobManagerVenue {
    baseUrl: string;
    auth: {
        apply(headers: Record<string, string>): void;
    };
}
declare class JobManager {
    private venue;
    constructor(venue: JobManagerVenue);
    list(): Promise<string[]>;
    get(jobId: string): Promise<Job>;
    cancel(jobId: string): Promise<JobMetadata>;
    delete(jobId: string): Promise<void>;
    pause(jobId: string): Promise<JobMetadata>;
    resume(jobId: string): Promise<JobMetadata>;
    sendMessage(jobId: string, message: any): Promise<any>;
    stream(jobId: string): AsyncGenerator<SSEEvent>;
    private _buildHeaders;
}

interface AssetManagerVenue {
    baseUrl: string;
    auth: {
        apply(headers: Record<string, string>): void;
    };
}
declare class AssetManager {
    private venue;
    constructor(venue: AssetManagerVenue);
    /**
     * Get asset by ID
     * @param assetId - Asset identifier
     * @returns Returns either an Operation or DataAsset based on the asset's metadata
     */
    get(assetId: AssetID): Promise<Asset>;
    /**
     * List assets with pagination support
     * @param options - Pagination options (offset, limit)
     */
    list(options?: AssetListOptions): Promise<AssetList>;
    /**
     * Register a new asset
     * @param assetData - Asset configuration
     */
    register(assetData: any): Promise<Asset>;
    /**
     * Get asset metadata
     * @param assetId - Asset identifier
     */
    getMetadata(assetId: string): Promise<AssetMetadata>;
    /**
     * Put content to asset
     * @param assetId - Asset identifier
     * @param content - Content to upload
     * @returns The content hash returned by the server
     */
    putContent(assetId: string, content: BodyInit): Promise<ContentHashResult>;
    /**
     * Get asset content
     * @param assetId - Asset identifier
     */
    getContent(assetId: string): Promise<ReadableStream<Uint8Array> | null>;
    /**
     * Clear the asset cache.
     */
    clearCache(): void;
    private _buildHeaders;
}

interface OperationManagerVenue {
    baseUrl: string;
    auth: {
        apply(headers: Record<string, string>): void;
    };
}
declare class OperationManager {
    private venue;
    constructor(venue: OperationManagerVenue);
    /**
     * List all named operations available on this venue
     */
    list(): Promise<OperationInfo[]>;
    /**
     * Get details of a named operation
     * @param name - Operation name (e.g., "test:echo")
     */
    get(name: string): Promise<OperationInfo>;
    /**
     * Execute an operation and wait for the result
     * @param assetId - Operation asset ID or named operation
     * @param input - Operation input parameters
     * @param options - Invoke options (e.g., ucans)
     */
    run(assetId: string, input: any, options?: InvokeOptions): Promise<any>;
    /**
     * Execute an operation and return a Job for tracking
     * @param assetId - Operation asset ID or named operation
     * @param input - Operation input parameters
     * @param options - Invoke options (e.g., ucans)
     */
    invoke(assetId: string, input: any, options?: InvokeOptions): Promise<Job>;
    private _buildHeaders;
}

interface WorkspaceManagerVenue {
    operations: {
        run(assetId: string, input: any): Promise<any>;
    };
}
declare class WorkspaceManager {
    private venue;
    constructor(venue: WorkspaceManagerVenue);
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

interface UCANManagerVenue {
    operations: {
        run(assetId: string, input: any): Promise<any>;
    };
}
declare class UCANManager {
    private venue;
    constructor(venue: UCANManagerVenue);
    issue(aud: string, att: UCANAttenuation[], exp: number): Promise<UCANIssueResult>;
}

interface SecretManagerVenue {
    operations: {
        run(assetId: string, input: any): Promise<any>;
    };
    listSecrets(): Promise<string[]>;
    putSecret(name: string, value: string): Promise<void>;
    deleteSecret(name: string): Promise<void>;
}
declare class SecretManager {
    private venue;
    constructor(venue: SecretManagerVenue);
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
    private _jobs?;
    private _assets?;
    private _operations?;
    private _workspace?;
    private _ucan?;
    private _secrets?;
    get agents(): AgentManager;
    get jobs(): JobManager;
    get assets(): AssetManager;
    get operations(): OperationManager;
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
     * Get asset by ID (convenience delegate to venue.assets.get)
     * @param assetId - Asset identifier
     * @returns {Promise<Asset>} Returns either an Operation or DataAsset based on the asset's metadata
     */
    getAsset(assetId: AssetID): Promise<Asset>;
    /**
     * List assets with pagination support (convenience delegate to venue.assets.list)
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
    auth: Auth;
    status(): Promise<StatusData>;
    getJob(jobId: string): Promise<Job>;
    listJobs(): Promise<string[]>;
    getAsset(assetId: AssetID): Promise<Asset>;
    listAssets(options?: AssetListOptions): Promise<AssetList>;
    didDocument(): Promise<DIDDocument>;
    mcpDiscovery(): Promise<MCPDiscovery>;
    agentCard(): Promise<AgentCard>;
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
    * @param auth - Optional authentication provider (BearerAuth, KeyPairAuth, etc.)
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

/**
 * Ed25519 keypair generation and utility functions.
 */
/**
 * Generate a random Ed25519 keypair.
 * @returns Object with privateKey (32 bytes) and publicKey (32 bytes)
 */
declare function generateKeyPair(): {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
};
/**
 * Convert a private key to hex string for storage.
 */
declare function privateKeyToHex(key: Uint8Array): string;
/**
 * Convert a hex string back to a private key Uint8Array.
 */
declare function hexToPrivateKey(hex: string): Uint8Array;

/**
 * Multikey encoding for Ed25519 public keys.
 * Follows the did:key spec with multicodec prefix 0xed01 for Ed25519.
 */
/**
 * Encode an Ed25519 public key as a multikey string (z-prefixed base58-btc).
 * @param publicKey - 32-byte Ed25519 public key
 * @returns Multikey string like "z6MkhaXgBZD..."
 */
declare function encodePublicKey(publicKey: Uint8Array): string;
/**
 * Decode a multikey string back to a 32-byte Ed25519 public key.
 * @param multikey - Multikey string starting with "z"
 * @returns 32-byte Ed25519 public key
 */
declare function decodePublicKey(multikey: string): Uint8Array;
/**
 * Create a did:key DID from an Ed25519 public key.
 * @param publicKey - 32-byte Ed25519 public key
 * @returns DID string like "did:key:z6MkhaXgBZD..."
 */
declare function didFromPublicKey(publicKey: Uint8Array): string;

export { type AdapterInfo, type AdaptersResult, type AgentCancelTaskInput, type AgentCard, type AgentCreateInput, type AgentCreateResult, type AgentDeleteInput, type AgentDeleteResult, type AgentListInput, type AgentListResult, AgentManager, type AgentMessageInput, type AgentMessageResult, type AgentQueryInput, type AgentQueryResult, type AgentRequestInput, type AgentRequestResult, type AgentResumeInput, AgentStatus, type AgentSuspendResult, type AgentTriggerInput, type AgentTriggerResult, type AgentUpdateInput, Asset, type AssetID, type AssetList, type AssetListOptions, AssetManager, type AssetMetadata, AssetNotFoundError, Auth, BearerAuth, type ContentDetails, type ContentHashResult, CoviaConnectionError, CoviaError, CoviaTimeoutError, type Credentials, CredentialsHTTP, type DIDDocument, DataAsset, type FunctionInfo, type FunctionsResult, Grid, GridError, type InvokeOptions, type InvokePayload, Job, JobFailedError, JobManager, type JobMetadata, JobNotFoundError, JobStatus, KeyPairAuth, type MCPDiscovery, NoAuth, NotFoundError, Operation, type OperationDetails, type OperationInfo, OperationManager, type OperationPayload, RunStatus, type SSEEvent, type SecretExtractInput, type SecretExtractResult, SecretManager, type SecretSetInput, type SecretSetResult, type StatsData, type StatusData, type UCANAttenuation, type UCANIssueInput, type UCANIssueResult, UCANManager, Venue, type VenueConstructor, type VenueData, type VenueInterface, type VenueOptions, type WorkspaceAppendInput, type WorkspaceAppendResult, type WorkspaceDeleteInput, type WorkspaceDeleteResult, type WorkspaceListInput, type WorkspaceListResult, WorkspaceManager, type WorkspaceReadInput, type WorkspaceReadResult, type WorkspaceSliceInput, type WorkspaceSliceResult, type WorkspaceWriteInput, type WorkspaceWriteResult, createSSEEvent, decodePublicKey, didFromPublicKey, encodePublicKey, fetchStreamWithError, fetchWithError, generateKeyPair, getAssetIdFromPath, getAssetIdFromVenueId, getParsedAssetId, hexToPrivateKey, isJobComplete, isJobFinished, isJobPaused, logger, parseSSEStream, privateKeyToHex };
