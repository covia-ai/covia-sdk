'use strict';

var didResolver = require('did-resolver');
var webDidResolver = require('web-did-resolver');

// src/types.ts
var RunStatus = /* @__PURE__ */ ((RunStatus3) => {
  RunStatus3["COMPLETE"] = "COMPLETE";
  RunStatus3["FAILED"] = "FAILED";
  RunStatus3["PENDING"] = "PENDING";
  RunStatus3["STARTED"] = "STARTED";
  RunStatus3["CANCELLED"] = "CANCELLED";
  RunStatus3["TIMEOUT"] = "TIMEOUT";
  RunStatus3["REJECTED"] = "REJECTED";
  RunStatus3["INPUT_REQUIRED"] = "INPUT_REQUIRED";
  RunStatus3["AUTH_REQUIRED"] = "AUTH_REQUIRED";
  RunStatus3["PAUSED"] = "PAUSED";
  return RunStatus3;
})(RunStatus || {});
var JobStatus = RunStatus;
var CoviaError = class extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "CoviaError";
    this.code = code;
    this.message = message;
  }
};
var GridError = class extends CoviaError {
  constructor(statusCode, message, responseBody = null) {
    super(`HTTP ${statusCode}: ${message}`, statusCode);
    this.name = "GridError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
};
var CoviaConnectionError = class extends CoviaError {
  constructor(message) {
    super(message);
    this.name = "CoviaConnectionError";
  }
};
var CoviaTimeoutError = class extends CoviaError {
  constructor(message) {
    super(message);
    this.name = "CoviaTimeoutError";
  }
};
var JobFailedError = class extends CoviaError {
  constructor(jobData) {
    const id = jobData.id ?? "unknown";
    const status = jobData.status ?? "unknown";
    let msg = `Job ${id} ${status}`;
    if (jobData.output?.error) {
      msg += `: ${jobData.output.error}`;
    }
    super(msg);
    this.name = "JobFailedError";
    this.jobData = jobData;
  }
};
var NotFoundError = class extends GridError {
  constructor(message) {
    super(404, message);
    this.name = "NotFoundError";
  }
};
var AssetNotFoundError = class extends NotFoundError {
  constructor(assetId) {
    super(`Asset not found: ${assetId}`);
    this.name = "AssetNotFoundError";
    this.assetId = assetId;
  }
};
var JobNotFoundError = class extends NotFoundError {
  constructor(jobId) {
    super(`Job not found: ${jobId}`);
    this.name = "JobNotFoundError";
    this.jobId = jobId;
  }
};

// src/Credentials.ts
var Auth = class {
};
var NoAuth = class extends Auth {
  apply(_headers) {
  }
};
var BearerAuth = class extends Auth {
  constructor(token) {
    super();
    this._token = token;
  }
  apply(headers) {
    headers["Authorization"] = `Bearer ${this._token}`;
  }
};
var BasicAuth = class extends Auth {
  constructor(username, password) {
    super();
    this._encoded = btoa(`${username}:${password}`);
  }
  apply(headers) {
    headers["Authorization"] = `Basic ${this._encoded}`;
  }
};
var CoviaUserAuth = class extends Auth {
  constructor(userId) {
    super();
    this._userId = userId;
  }
  apply(headers) {
    if (this._userId && this._userId !== "") {
      headers["X-Covia-User"] = this._userId;
    }
  }
};
var CredentialsHTTP = class {
  constructor(venueId, apiKey, userId) {
    this.venueId = venueId;
    this.apiKey = apiKey;
    this.userId = userId;
  }
};

// src/Logger.ts
var defaultHandler = (_level, message) => {
  console.debug(`[covia] ${message}`);
};
var logger = {
  level: "none",
  handler: defaultHandler,
  debug(message) {
    if (this.level === "debug") {
      this.handler("debug", message);
    }
  }
};

// src/Utils.ts
async function parseErrorBody(response) {
  let body = null;
  let message = `Request failed with status ${response.status}`;
  try {
    body = await response.json();
    if (body?.error) {
      message = body.error;
    }
  } catch {
    try {
      const text = await response.text();
      if (text) message = text;
    } catch {
    }
  }
  return { message, body };
}
async function throwHttpError(response) {
  const { message, body } = await parseErrorBody(response);
  if (response.status === 404) {
    throw new NotFoundError(message);
  }
  throw new GridError(response.status, message, body);
}
function wrapError(error) {
  if (error instanceof CoviaError) return error;
  const msg = error.message ?? String(error);
  if (error instanceof TypeError) {
    return new CoviaConnectionError(msg);
  }
  return new CoviaError(`Request failed: ${msg}`);
}
async function fetchWithError(url, options) {
  const method = options?.method ?? "GET";
  logger.debug(`${method} ${url}`);
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const msg = error.message ?? String(error);
    logger.debug(`Connection failed: ${method} ${url} \u2014 ${msg}`);
    throw wrapError(error);
  }
  logger.debug(`${method} ${url} \u2192 ${response.status}`);
  if (!response.ok) {
    await throwHttpError(response);
  }
  return response.json();
}
async function fetchStreamWithError(url, options) {
  const method = options?.method ?? "GET";
  logger.debug(`${method} ${url}`);
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const msg = error.message ?? String(error);
    logger.debug(`Connection failed: ${method} ${url} \u2014 ${msg}`);
    throw wrapError(error);
  }
  logger.debug(`${method} ${url} \u2192 ${response.status}`);
  if (!response.ok) {
    await throwHttpError(response);
  }
  return response;
}
function isJobComplete(jobStatus) {
  if (jobStatus == null)
    return false;
  return jobStatus == "COMPLETE" /* COMPLETE */ ? true : false;
}
function isJobPaused(jobStatus) {
  if (jobStatus == null)
    return false;
  return jobStatus == "PAUSED" /* PAUSED */ || jobStatus == "INPUT_REQUIRED" /* INPUT_REQUIRED */ || jobStatus == "AUTH_REQUIRED" /* AUTH_REQUIRED */;
}
function isJobFinished(jobStatus) {
  if (jobStatus == null)
    return false;
  if (jobStatus == "COMPLETE" /* COMPLETE */) return true;
  if (jobStatus == "FAILED" /* FAILED */) return true;
  if (jobStatus == "REJECTED" /* REJECTED */) return true;
  if (jobStatus == "CANCELLED" /* CANCELLED */) return true;
  if (jobStatus == "TIMEOUT" /* TIMEOUT */) return true;
  return false;
}
function getParsedAssetId(assetId) {
  if (assetId.startsWith("did:web")) {
    const parts = assetId.split("/");
    return parts[parts.length - 1];
  }
  return assetId;
}
function getAssetIdFromPath(assetHex, assetPath) {
  const venueDid = decodeURIComponent(assetPath.split("/")[4]);
  return venueDid + "/a/" + assetHex;
}
function getAssetIdFromVenueId(assetHex, venueId) {
  return venueId + "/a/" + assetHex;
}
function createSSEEvent(fields) {
  const data = fields.data ?? "";
  return {
    event: fields.event || null,
    data,
    id: fields.id || null,
    retry: fields.retry ?? null,
    json() {
      return JSON.parse(data);
    }
  };
}
async function* parseSSEStream(response) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  let event;
  let data = [];
  let id;
  let retry;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "") {
          if (data.length > 0 || event !== void 0) {
            yield createSSEEvent({
              event,
              data: data.join("\n"),
              id,
              retry
            });
            event = void 0;
            data = [];
            id = void 0;
            retry = void 0;
          }
          continue;
        }
        if (line.startsWith(":")) continue;
        const colonIdx = line.indexOf(":");
        let field;
        let val;
        if (colonIdx === -1) {
          field = line;
          val = "";
        } else {
          field = line.slice(0, colonIdx);
          val = line.slice(colonIdx + 1);
          if (val.startsWith(" ")) val = val.slice(1);
        }
        switch (field) {
          case "event":
            event = val;
            break;
          case "data":
            data.push(val);
            break;
          case "id":
            id = val;
            break;
          case "retry": {
            const n = parseInt(val, 10);
            if (!isNaN(n)) retry = n;
            break;
          }
        }
      }
    }
    if (data.length > 0 || event !== void 0) {
      yield createSSEEvent({ event, data: data.join("\n"), id, retry });
    }
  } finally {
    reader.releaseLock();
  }
}

// src/Asset.ts
var cache = /* @__PURE__ */ new Map();
var Asset = class {
  constructor(id, venue, metadata = {}) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
  }
  /**
   * Get asset metadata
   * @returns {Promise<AssetMetadata>}
   */
  async getMetadata() {
    if (cache.has(this.id)) {
      return Promise.resolve(cache.get(this.id));
    } else {
      const data = this.venue.getMetadata(this.id);
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
  async readStream(reader) {
    return this.readStream(reader);
  }
  /**
   * Put content to asset
   * @param content - Content to upload
   * @returns {Promise<ReadableStream<Uint8Array> | null>}
   */
  putContent(content) {
    return this.venue.putContent(this.id, content);
  }
  /**
   * Get asset content
   * @returns {Promise<ReadableStream<Uint8Array> | null>}
   */
  getContent() {
    return this.venue.getContent(this.id);
  }
  /**
   * Get the URL for downloading asset content
   * @returns {string} The URL for downloading the asset content
   */
  getContentURL() {
    return `${this.venue.baseUrl}/api/v1/assets/${this.id}/content`;
  }
  /**
   * Execute the operation
   * @param input - Operation input parameters
   * @returns {Promise<any>}
   */
  run(input) {
    return this.venue.run(this.id, input);
  }
  /**
  * Execute the operation
  * @param input - Operation input parameters
  * @returns {Promise<any>}
  */
  invoke(input) {
    return this.venue.invoke(this.id, input);
  }
};

// src/Operation.ts
var Operation = class extends Asset {
  constructor(id, venue, metadata = {}) {
    super(id, venue, metadata);
  }
  // Operation-specific methods can be added here
  // For now, it inherits all functionality from Asset
};

// src/DataAsset.ts
var DataAsset = class extends Asset {
  constructor(id, venue, metadata = {}) {
    super(id, venue, metadata);
  }
  // DataAsset-specific methods can be added here
  // For now, it inherits all functionality from Asset
};

// src/Job.ts
var INITIAL_POLL_DELAY = 300;
var BACKOFF_FACTOR = 1.5;
var MAX_POLL_DELAY = 1e4;
var Job = class {
  constructor(id, venue, metadata) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
  }
  /**
   * Whether the job has reached a terminal state
   */
  get isFinished() {
    return this.metadata.status != null && isJobFinished(this.metadata.status);
  }
  /**
   * Whether the job completed successfully
   */
  get isComplete() {
    return this.metadata.status != null && isJobComplete(this.metadata.status);
  }
  /**
   * The job output.
   * @throws {Error} If the job has not finished yet.
   * @throws {JobFailedError} If the job finished with a non-COMPLETE status.
   */
  get output() {
    if (!this.isFinished) {
      throw new Error(`Job is not finished (status: ${this.metadata.status})`);
    }
    if (!this.isComplete) {
      throw new JobFailedError(this.metadata);
    }
    return this.metadata.output;
  }
  /**
   * Poll the venue for the latest job status.
   * @throws {Error} If the job has no ID.
   */
  async refresh() {
    if (!this.id) {
      throw new Error("Cannot refresh a job with no ID");
    }
    const job = await this.venue.getJob(this.id);
    this.metadata = job.metadata;
  }
  /**
   * Wait until the job reaches a terminal state.
   * Uses exponential backoff polling (initial 300ms, factor 1.5, max 10s).
   * @param options.timeout - Maximum milliseconds to wait. Undefined waits indefinitely.
   * @throws {CoviaTimeoutError} If timeout is exceeded.
   */
  async wait(options) {
    if (this.isFinished) return;
    let delay = INITIAL_POLL_DELAY;
    const start = Date.now();
    logger.debug(`Polling job ${this.id} (status: ${this.metadata.status})`);
    while (!this.isFinished) {
      if (options?.timeout !== void 0 && Date.now() - start > options.timeout) {
        throw new CoviaTimeoutError(`Job ${this.id} did not finish within ${options.timeout}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      await this.refresh();
      logger.debug(`Job ${this.id} polled \u2192 ${this.metadata.status} (delay=${(delay / 1e3).toFixed(1)}s)`);
      delay = Math.min(delay * BACKOFF_FACTOR, MAX_POLL_DELAY);
    }
  }
  /**
   * Wait for the job to complete and return its output.
   * @param options.timeout - Maximum milliseconds to wait.
   * @returns The job output.
   * @throws {JobFailedError} If the job finishes with a non-COMPLETE status.
   * @throws {CoviaTimeoutError} If timeout is exceeded.
   */
  async result(options) {
    await this.wait(options);
    return this.output;
  }
  /**
   * Stream server-sent events for this job.
   * @returns AsyncGenerator yielding SSEEvent objects
   */
  async *stream() {
    yield* this.venue.streamJobEvents(this.id);
  }
  /**
   * Cancels the execution of the job
   * @returns {Promise<number>}
   */
  async cancelJob() {
    return this.venue.cancelJob(this.id);
  }
  /**
   * Delete the job
   * @returns {Promise<number>}
   */
  async deleteJob() {
    return this.venue.deleteJob(this.id);
  }
};

// src/Venue.ts
var webResolver = webDidResolver.getResolver();
var resolver = new didResolver.Resolver(webResolver);
var cache2 = /* @__PURE__ */ new Map();
var Venue = class _Venue {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || "";
    this.venueId = options.venueId || "";
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
  static async connect(venueId, auth) {
    if (venueId instanceof _Venue) {
      return new _Venue({
        baseUrl: venueId.baseUrl,
        venueId: venueId.venueId,
        name: venueId.metadata.name,
        auth
      });
    }
    if (typeof venueId === "string") {
      let baseUrl;
      if (venueId.startsWith("http:") || venueId.startsWith("https:")) {
        baseUrl = venueId;
        if (baseUrl.endsWith("/"))
          baseUrl = baseUrl.substring(0, baseUrl.length - 1);
      } else if (venueId.startsWith("did:web:")) {
        const didDoc = await resolver.resolve(venueId);
        if (!didDoc.didDocument) {
          throw new CoviaError("Invalid DID document");
        }
        const endpoint = didDoc.didDocument.service?.find((service) => service.type === "Covia.API.v1")?.serviceEndpoint;
        if (!endpoint) {
          throw new CoviaError("No endpoint found for DID");
        }
        baseUrl = endpoint.toString().replace(/\/api\/v1/, "");
      } else {
        baseUrl = `https://${venueId}`;
      }
      const data = await fetchWithError(baseUrl + "/api/v1/status");
      return new _Venue({
        baseUrl,
        venueId: data.did,
        name: data.name,
        auth
      });
    }
    throw new CoviaError("Invalid venue ID parameter. Must be a string (URL/DNS) or Venue instance.");
  }
  /**
   * Register a new asset
   * @param assetData - Asset configuration
   * @returns {Promise<Asset>}
   */
  async register(assetData) {
    return fetchWithError(`${this.baseUrl}/api/v1/assets/`, {
      method: "POST",
      headers: this._buildHeaders(),
      body: JSON.stringify(assetData)
    }).then((response) => {
      return this.getAsset(response);
    });
  }
  /**
   * Read stream from asset
   * @param reader - ReadableStreamDefaultReader
   */
  async readStream(reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
    }
  }
  /**
   * Get asset by ID
   * @param assetId - Asset identifier
   * @returns {Promise<Asset>} Returns either an Operation or DataAsset based on the asset's metadata
   */
  async getAsset(assetId) {
    if (cache2.has(assetId)) {
      const cachedData = cache2.get(assetId);
      if (cachedData.metadata?.operation) {
        return new Operation(assetId, this, cachedData);
      } else {
        return new DataAsset(assetId, this, cachedData);
      }
    }
    try {
      const data = await fetchWithError(`${this.baseUrl}/api/v1/assets/${assetId}`);
      cache2.set(assetId, data);
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
  async listAssets(options = {}) {
    const params = new URLSearchParams();
    params.set("offset", String(options.offset ?? 0));
    if (options.limit !== void 0) {
      params.set("limit", String(options.limit));
    }
    return fetchWithError(`${this.baseUrl}/api/v1/assets/?${params.toString()}`);
  }
  /**
   * List all jobs
   * @returns {Promise<string[]>}
   */
  async listJobs() {
    return fetchWithError(`${this.baseUrl}/api/v1/jobs`);
  }
  /**
   * Get job by ID
   * @param jobId - Job identifier
   * @returns {Promise<Job>}
   */
  async getJob(jobId) {
    try {
      const data = await fetchWithError(`${this.baseUrl}/api/v1/jobs/${jobId}`);
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
  async cancelJob(jobId) {
    try {
      const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/jobs/${jobId}/cancel`, { method: "PUT" });
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
  async deleteJob(jobId) {
    try {
      const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/jobs/${jobId}/delete`, { method: "PUT" });
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
  status() {
    return fetchWithError(`${this.baseUrl}/api/v1/status`);
  }
  /**
   * List all named operations available on this venue
   * @returns {Promise<OperationInfo[]>}
   */
  async listOperations() {
    return fetchWithError(`${this.baseUrl}/api/v1/operations`);
  }
  /**
   * Get details of a named operation
   * @param name - Operation name (e.g., "test:echo")
   * @returns {Promise<OperationInfo>}
   */
  async getOperation(name) {
    return fetchWithError(`${this.baseUrl}/api/v1/operations/${name}`);
  }
  /**
   * Get the full DID document for this venue
   * @returns {Promise<DIDDocument>}
   */
  async didDocument() {
    return fetchWithError(`${this.baseUrl}/.well-known/did.json`);
  }
  /**
   * Get MCP (Model Context Protocol) discovery information
   * @returns {Promise<MCPDiscovery>}
   */
  async mcpDiscovery() {
    return fetchWithError(`${this.baseUrl}/.well-known/mcp`);
  }
  /**
   * Get the A2A (Agent-to-Agent) agent card
   * @returns {Promise<AgentCard>}
   */
  async agentCard() {
    return fetchWithError(`${this.baseUrl}/.well-known/agent-card.json`);
  }
  /**
   * Get asset metadata
   * @returns {Promise<AssetMetadata>}
   */
  async getMetadata(assetId) {
    try {
      return await fetchWithError(`${this.baseUrl}/api/v1/assets/${assetId}`);
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
  async putContent(assetId, content) {
    try {
      const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/assets/${assetId}/content`, {
        method: "PUT",
        headers: this._buildHeaders(),
        body: content
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
  async getContent(assetId) {
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
  async run(assetId, input) {
    const payload = {
      operation: assetId,
      input
    };
    try {
      const response = await fetchWithError(`${this.baseUrl}/api/v1/invoke/`, {
        method: "POST",
        headers: this._buildHeaders(),
        body: JSON.stringify(payload)
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
  async invoke(assetId, input) {
    const payload = {
      operation: assetId,
      input
    };
    try {
      const response = await fetchWithError(`${this.baseUrl}/api/v1/invoke/`, {
        method: "POST",
        headers: this._buildHeaders(),
        body: JSON.stringify(payload)
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
  async *streamJobEvents(jobId) {
    const response = await fetchStreamWithError(`${this.baseUrl}/api/v1/jobs/${jobId}/sse`, {
      headers: { ...this._buildHeaders(), "Accept": "text/event-stream" }
    });
    yield* parseSSEStream(response);
  }
  /**
   * Close the venue and release resources.
   * Clears cached asset data for this venue.
   */
  close() {
    cache2.clear();
  }
  /**
   * Disposable support — allows `using venue = await Grid.connect(...)` in TS 5.2+.
   */
  [Symbol.dispose]() {
    this.close();
  }
  _buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    this.auth.apply(headers);
    return headers;
  }
};

// src/Grid.ts
var cache3 = /* @__PURE__ */ new Map();
var Grid = class {
  /**
  * Static method to connect to a venue
  * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
  * @param auth - Optional authentication provider (BearerAuth, BasicAuth, etc.)
  * @returns {Promise<Venue>} A new Venue instance configured appropriately
  */
  static async connect(venueId, auth) {
    if (cache3.has(venueId))
      return Promise.resolve(cache3.get(venueId));
    const connectedVenue = await Venue.connect(venueId, auth);
    cache3.set(venueId, connectedVenue);
    return Promise.resolve(connectedVenue);
  }
};

exports.Asset = Asset;
exports.AssetNotFoundError = AssetNotFoundError;
exports.Auth = Auth;
exports.BasicAuth = BasicAuth;
exports.BearerAuth = BearerAuth;
exports.CoviaConnectionError = CoviaConnectionError;
exports.CoviaError = CoviaError;
exports.CoviaTimeoutError = CoviaTimeoutError;
exports.CoviaUserAuth = CoviaUserAuth;
exports.CredentialsHTTP = CredentialsHTTP;
exports.DataAsset = DataAsset;
exports.Grid = Grid;
exports.GridError = GridError;
exports.Job = Job;
exports.JobFailedError = JobFailedError;
exports.JobNotFoundError = JobNotFoundError;
exports.JobStatus = JobStatus;
exports.NoAuth = NoAuth;
exports.NotFoundError = NotFoundError;
exports.Operation = Operation;
exports.RunStatus = RunStatus;
exports.Venue = Venue;
exports.createSSEEvent = createSSEEvent;
exports.fetchStreamWithError = fetchStreamWithError;
exports.fetchWithError = fetchWithError;
exports.getAssetIdFromPath = getAssetIdFromPath;
exports.getAssetIdFromVenueId = getAssetIdFromVenueId;
exports.getParsedAssetId = getParsedAssetId;
exports.isJobComplete = isJobComplete;
exports.isJobFinished = isJobFinished;
exports.isJobPaused = isJobPaused;
exports.logger = logger;
exports.parseSSEStream = parseSSEStream;
