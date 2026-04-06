'use strict';

var ed = require('@noble/ed25519');
var sha512 = require('@noble/hashes/sha512');
var didResolver = require('did-resolver');
var webDidResolver = require('web-did-resolver');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var ed__namespace = /*#__PURE__*/_interopNamespace(ed);

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/crypto/keys.ts
var keys_exports = {};
__export(keys_exports, {
  generateKeyPair: () => generateKeyPair,
  getPublicKey: () => getPublicKey2,
  hexToPrivateKey: () => hexToPrivateKey,
  privateKeyToHex: () => privateKeyToHex
});
function generateKeyPair() {
  const privateKey = ed__namespace.utils.randomPrivateKey();
  const publicKey = ed__namespace.getPublicKey(privateKey);
  return { privateKey, publicKey };
}
function getPublicKey2(privateKey) {
  return ed__namespace.getPublicKey(privateKey);
}
function privateKeyToHex(key) {
  return Array.from(key).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToPrivateKey(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
var init_keys = __esm({
  "src/crypto/keys.ts"() {
    ed__namespace.etc.sha512Sync = (...m) => {
      const h = sha512.sha512.create();
      for (const msg of m) h.update(msg);
      return h.digest();
    };
  }
});

// src/crypto/base58.ts
function encode(bytes) {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % BASE;
      carry = carry / BASE | 0;
    }
    while (carry > 0) {
      digits.push(carry % BASE);
      carry = carry / BASE | 0;
    }
  }
  let result = ALPHABET[0].repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }
  return result;
}
function decode(str) {
  if (str.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < str.length && str[zeros] === ALPHABET[0]) zeros++;
  const bytes = [];
  for (let i = zeros; i < str.length; i++) {
    const val = ALPHABET_MAP.get(str[i]);
    if (val === void 0) throw new Error(`Invalid base58 character: ${str[i]}`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * BASE;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < zeros; i++) result[i] = 0;
  for (let i = 0; i < bytes.length; i++) result[zeros + i] = bytes[bytes.length - 1 - i];
  return result;
}
var ALPHABET, BASE, ALPHABET_MAP;
var init_base58 = __esm({
  "src/crypto/base58.ts"() {
    ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    BASE = 58;
    ALPHABET_MAP = /* @__PURE__ */ new Map();
    for (let i = 0; i < ALPHABET.length; i++) {
      ALPHABET_MAP.set(ALPHABET[i], i);
    }
  }
});

// src/crypto/multikey.ts
var multikey_exports = {};
__export(multikey_exports, {
  decodePublicKey: () => decodePublicKey,
  didFromPublicKey: () => didFromPublicKey,
  encodePublicKey: () => encodePublicKey
});
function encodePublicKey(publicKey) {
  const prefixed = new Uint8Array(2 + publicKey.length);
  prefixed.set(ED25519_PREFIX, 0);
  prefixed.set(publicKey, 2);
  return "z" + encode(prefixed);
}
function decodePublicKey(multikey) {
  if (!multikey.startsWith("z")) {
    throw new Error('Multikey must start with "z"');
  }
  const decoded = decode(multikey.slice(1));
  if (decoded[0] !== 237 || decoded[1] !== 1) {
    throw new Error("Invalid Ed25519 multikey prefix");
  }
  return decoded.slice(2);
}
function didFromPublicKey(publicKey) {
  return `did:key:${encodePublicKey(publicKey)}`;
}
var ED25519_PREFIX;
var init_multikey = __esm({
  "src/crypto/multikey.ts"() {
    init_base58();
    ED25519_PREFIX = new Uint8Array([237, 1]);
  }
});

// src/crypto/jwt.ts
var jwt_exports = {};
__export(jwt_exports, {
  base64UrlEncode: () => base64UrlEncode,
  createEdDSAJWT: () => createEdDSAJWT
});
function base64UrlEncode(data) {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function createEdDSAJWT(privateKey, lifetimeSeconds = 300) {
  const publicKey = getPublicKey2(privateKey);
  const multikey = encodePublicKey(publicKey);
  const did = `did:key:${multikey}`;
  const nowSecs = Math.floor(Date.now() / 1e3);
  const header = JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: multikey });
  const payload = JSON.stringify({
    sub: did,
    iss: did,
    iat: nowSecs,
    exp: nowSecs + lifetimeSeconds
  });
  const headerB64 = base64UrlEncode(encoder.encode(header));
  const payloadB64 = base64UrlEncode(encoder.encode(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = ed.sign(encoder.encode(signingInput), privateKey);
  const signatureB64 = base64UrlEncode(signature);
  return `${signingInput}.${signatureB64}`;
}
var encoder;
var init_jwt = __esm({
  "src/crypto/jwt.ts"() {
    init_multikey();
    init_keys();
    encoder = new TextEncoder();
  }
});

// src/types.ts
var RunStatus = /* @__PURE__ */ ((RunStatus2) => {
  RunStatus2["COMPLETE"] = "COMPLETE";
  RunStatus2["FAILED"] = "FAILED";
  RunStatus2["PENDING"] = "PENDING";
  RunStatus2["STARTED"] = "STARTED";
  RunStatus2["CANCELLED"] = "CANCELLED";
  RunStatus2["TIMEOUT"] = "TIMEOUT";
  RunStatus2["REJECTED"] = "REJECTED";
  RunStatus2["INPUT_REQUIRED"] = "INPUT_REQUIRED";
  RunStatus2["AUTH_REQUIRED"] = "AUTH_REQUIRED";
  RunStatus2["PAUSED"] = "PAUSED";
  return RunStatus2;
})(RunStatus || {});
var JobStatus = RunStatus;
var AgentStatus = /* @__PURE__ */ ((AgentStatus2) => {
  AgentStatus2["SLEEPING"] = "SLEEPING";
  AgentStatus2["RUNNING"] = "RUNNING";
  AgentStatus2["SUSPENDED"] = "SUSPENDED";
  AgentStatus2["TERMINATED"] = "TERMINATED";
  return AgentStatus2;
})(AgentStatus || {});
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
var KeyPairAuth = class _KeyPairAuth extends Auth {
  /**
   * @param privateKey - 32-byte Ed25519 private key
   * @param tokenLifetimeSeconds - JWT lifetime in seconds (default 300 = 5 min)
   */
  constructor(privateKey, tokenLifetimeSeconds = 300) {
    super();
    const { getPublicKey: getPublicKey3 } = (init_keys(), __toCommonJS(keys_exports));
    const { didFromPublicKey: didFromPublicKey2 } = (init_multikey(), __toCommonJS(multikey_exports));
    this._privateKey = privateKey;
    this._publicKey = getPublicKey3(privateKey);
    this._did = didFromPublicKey2(this._publicKey);
    this._lifetime = tokenLifetimeSeconds;
  }
  apply(headers) {
    const { createEdDSAJWT: createEdDSAJWT2 } = (init_jwt(), __toCommonJS(jwt_exports));
    const jwt = createEdDSAJWT2(this._privateKey, this._lifetime);
    headers["Authorization"] = `Bearer ${jwt}`;
  }
  /** The caller's DID derived from the public key. */
  getDID() {
    return this._did;
  }
  /** The 32-byte Ed25519 public key. */
  getPublicKey() {
    return this._publicKey;
  }
  /** Generate a new random keypair and return a KeyPairAuth instance. */
  static generate(tokenLifetimeSeconds = 300) {
    const { generateKeyPair: generateKeyPair2 } = (init_keys(), __toCommonJS(keys_exports));
    const { privateKey } = generateKeyPair2();
    return new _KeyPairAuth(privateKey, tokenLifetimeSeconds);
  }
  /** Create from a hex-encoded private key string. */
  static fromHex(privateKeyHex, tokenLifetimeSeconds = 300) {
    const { hexToPrivateKey: hexToPrivateKey2 } = (init_keys(), __toCommonJS(keys_exports));
    return new _KeyPairAuth(hexToPrivateKey2(privateKeyHex), tokenLifetimeSeconds);
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

// src/AgentManager.ts
var AgentManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async create(input) {
    return this.venue.operations.run("agent:create", input);
  }
  async request(agentId, input, wait) {
    return this.venue.operations.run("agent:request", { agentId, input, wait });
  }
  async message(agentId, message) {
    return this.venue.operations.run("agent:message", { agentId, message });
  }
  async trigger(agentId) {
    return this.venue.operations.run("agent:trigger", { agentId });
  }
  async query(agentId) {
    return this.venue.operations.run("agent:query", { agentId });
  }
  async list(includeTerminated) {
    return this.venue.operations.run("agent:list", { includeTerminated });
  }
  async delete(agentId, remove) {
    return this.venue.operations.run("agent:delete", { agentId, remove });
  }
  async suspend(agentId) {
    return this.venue.operations.run("agent:suspend", { agentId });
  }
  async resume(agentId, autoWake) {
    return this.venue.operations.run("agent:resume", { agentId, autoWake });
  }
  async update(input) {
    return this.venue.operations.run("agent:update", input);
  }
  async cancelTask(agentId, taskId) {
    return this.venue.operations.run("agent:cancelTask", { agentId, taskId });
  }
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
    this._jobs = venue.jobs;
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
    yield* this._jobs.stream(this.id);
  }
  /**
   * Whether the job is paused (PAUSED, INPUT_REQUIRED, or AUTH_REQUIRED)
   */
  get isPaused() {
    return this.metadata.status != null && isJobPaused(this.metadata.status);
  }
  /**
   * Whether the job requires user input
   */
  get needsInput() {
    return this.metadata.status === "INPUT_REQUIRED" /* INPUT_REQUIRED */;
  }
  /**
   * Whether the job requires authentication
   */
  get needsAuth() {
    return this.metadata.status === "AUTH_REQUIRED" /* AUTH_REQUIRED */;
  }
  /**
   * Send a message to the running job
   * @param message - Message payload
   * @returns {Promise<any>}
   */
  async sendMessage(message) {
    return this._jobs.sendMessage(this.id, message);
  }
  /**
   * Pause the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async pause() {
    this.metadata = await this._jobs.pause(this.id);
    return this.metadata;
  }
  /**
   * Resume the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async resume() {
    this.metadata = await this._jobs.resume(this.id);
    return this.metadata;
  }
  /**
   * Cancel the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async cancel() {
    this.metadata = await this._jobs.cancel(this.id);
    return this.metadata;
  }
  /**
   * Delete the job
   */
  async delete() {
    return this._jobs.delete(this.id);
  }
};

// src/JobManager.ts
var JobManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async list() {
    return fetchWithError(`${this.venue.baseUrl}/api/v1/jobs`);
  }
  async get(jobId) {
    try {
      const data = await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}`);
      return new Job(jobId, this.venue, data);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async cancel(jobId) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/cancel`, {
        method: "PUT",
        headers: this._buildHeaders()
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async delete(jobId) {
    try {
      await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/delete`, {
        method: "PUT",
        headers: this._buildHeaders()
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async pause(jobId) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/pause`, {
        method: "PUT",
        headers: this._buildHeaders()
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async resume(jobId) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/resume`, {
        method: "PUT",
        headers: this._buildHeaders()
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async sendMessage(jobId, message) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}`, {
        method: "POST",
        headers: this._buildHeaders(),
        body: JSON.stringify(message)
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }
  async *stream(jobId) {
    const response = await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/sse`, {
      headers: { ...this._buildHeaders(), "Accept": "text/event-stream" }
    });
    yield* parseSSEStream(response);
  }
  _buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    this.venue.auth.apply(headers);
    return headers;
  }
};

// src/Asset.ts
var cache = /* @__PURE__ */ new Map();
var Asset = class {
  constructor(id, venue, metadata = {}) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
    this._assets = venue.assets;
    this._operations = venue.operations;
  }
  /**
   * Get asset metadata
   * @returns {Promise<AssetMetadata>}
   */
  async getMetadata() {
    if (cache.has(this.id)) {
      return Promise.resolve(cache.get(this.id));
    } else {
      const data = this._assets.getMetadata(this.id);
      if (data) {
        cache.set(this.id, data);
      }
      return data;
    }
  }
  /**
   * Put content to asset
   * @param content - Content to upload
   * @returns {Promise<ContentHashResult>} The content hash returned by the server
   */
  putContent(content) {
    return this._assets.putContent(this.id, content);
  }
  /**
   * Get asset content
   * @returns {Promise<ReadableStream<Uint8Array> | null>}
   */
  getContent() {
    return this._assets.getContent(this.id);
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
    return this._operations.run(this.id, input);
  }
  /**
  * Execute the operation
  * @param input - Operation input parameters
  * @returns {Promise<Job>}
  */
  invoke(input) {
    return this._operations.invoke(this.id, input);
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

// src/AssetManager.ts
var cache2 = /* @__PURE__ */ new Map();
var AssetManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  /**
   * Get asset by ID
   * @param assetId - Asset identifier
   * @returns Returns either an Operation or DataAsset based on the asset's metadata
   */
  async get(assetId) {
    if (cache2.has(assetId)) {
      const cachedData = cache2.get(assetId);
      if (cachedData.metadata?.operation) {
        return new Operation(assetId, this.venue, cachedData);
      } else {
        return new DataAsset(assetId, this.venue, cachedData);
      }
    }
    try {
      const data = await fetchWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}`);
      cache2.set(assetId, data);
      if (data.metadata?.operation) {
        return new Operation(assetId, this.venue, data);
      } else {
        return new DataAsset(assetId, this.venue, data);
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
   */
  async list(options = {}) {
    const params = new URLSearchParams();
    params.set("offset", String(options.offset ?? 0));
    if (options.limit !== void 0) {
      params.set("limit", String(options.limit));
    }
    return fetchWithError(`${this.venue.baseUrl}/api/v1/assets?${params.toString()}`);
  }
  /**
   * Register a new asset
   * @param assetData - Asset configuration
   */
  async register(assetData) {
    return fetchWithError(`${this.venue.baseUrl}/api/v1/assets`, {
      method: "POST",
      headers: this._buildHeaders(),
      body: JSON.stringify(assetData)
    }).then((response) => this.get(response));
  }
  /**
   * Get asset metadata
   * @param assetId - Asset identifier
   */
  async getMetadata(assetId) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}`);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }
  /**
   * Put content to asset
   * @param assetId - Asset identifier
   * @param content - Content to upload
   * @returns The content hash returned by the server
   */
  async putContent(assetId, content) {
    try {
      return await fetchWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}/content`, {
        method: "PUT",
        headers: this._buildHeaders(),
        body: content
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }
  /**
   * Get asset content
   * @param assetId - Asset identifier
   */
  async getContent(assetId) {
    try {
      const response = await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/assets/${assetId}/content`);
      return response.body;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new AssetNotFoundError(assetId);
      }
      throw error;
    }
  }
  /**
   * Clear the asset cache.
   */
  clearCache() {
    cache2.clear();
  }
  _buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    this.venue.auth.apply(headers);
    return headers;
  }
};

// src/OperationManager.ts
var OperationManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  /**
   * List all named operations available on this venue
   */
  async list() {
    return fetchWithError(`${this.venue.baseUrl}/api/v1/operations`);
  }
  /**
   * Get details of a named operation
   * @param name - Operation name (e.g., "test:echo")
   */
  async get(name) {
    return fetchWithError(`${this.venue.baseUrl}/api/v1/operations/${name}`);
  }
  /**
   * Execute an operation and wait for the result
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Invoke options (e.g., ucans)
   */
  async run(assetId, input, options) {
    const job = await this.invoke(assetId, input, options);
    return job.result();
  }
  /**
   * Execute an operation and return a Job for tracking
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Invoke options (e.g., ucans)
   */
  async invoke(assetId, input, options) {
    const payload = {
      operation: assetId,
      input
    };
    if (options?.ucans) {
      payload.ucans = options.ucans;
    }
    const response = await fetchWithError(`${this.venue.baseUrl}/api/v1/invoke`, {
      method: "POST",
      headers: this._buildHeaders(),
      body: JSON.stringify(payload)
    });
    return new Job(response?.id, this.venue, response);
  }
  _buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    this.venue.auth.apply(headers);
    return headers;
  }
};

// src/WorkspaceManager.ts
var WorkspaceManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async read(path, maxSize) {
    return this.venue.operations.run("covia:read", { path, maxSize });
  }
  async write(path, value) {
    return this.venue.operations.run("covia:write", { path, value });
  }
  async delete(path) {
    return this.venue.operations.run("covia:delete", { path });
  }
  async append(path, value) {
    return this.venue.operations.run("covia:append", { path, value });
  }
  async list(path, limit, offset) {
    return this.venue.operations.run("covia:list", { path, limit, offset });
  }
  async slice(path, offset, limit) {
    return this.venue.operations.run("covia:slice", { path, offset, limit });
  }
  async functions() {
    return this.venue.operations.run("covia:functions", {});
  }
  async describe(name) {
    return this.venue.operations.run("covia:describe", { name });
  }
  async adapters() {
    return this.venue.operations.run("covia:adapters", {});
  }
};

// src/UCANManager.ts
var UCANManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async issue(aud, att, exp) {
    return this.venue.operations.run("ucan:issue", { aud, att, exp });
  }
};

// src/SecretManager.ts
var SecretManager = class {
  constructor(venue) {
    this.venue = venue;
  }
  async set(name, value) {
    return this.venue.operations.run("secret:set", { name, value });
  }
  /**
   * Extract a secret value by name.
   * NOTE: This operation requires a UCAN capability grant. The backend
   * may reject requests that lack the appropriate capability proof.
   */
  async extract(name) {
    return this.venue.operations.run("secret:extract", { name });
  }
  async list() {
    return this.venue.listSecrets();
  }
  async put(name, value) {
    return this.venue.putSecret(name, value);
  }
  async delete(name) {
    return this.venue.deleteSecret(name);
  }
};
var webResolver = webDidResolver.getResolver();
var resolver = new didResolver.Resolver(webResolver);
var Venue = class _Venue {
  get agents() {
    return this._agents ?? (this._agents = new AgentManager(this));
  }
  get jobs() {
    return this._jobs ?? (this._jobs = new JobManager(this));
  }
  get assets() {
    return this._assets ?? (this._assets = new AssetManager(this));
  }
  get operations() {
    return this._operations ?? (this._operations = new OperationManager(this));
  }
  get workspace() {
    return this._workspace ?? (this._workspace = new WorkspaceManager(this));
  }
  get ucan() {
    return this._ucan ?? (this._ucan = new UCANManager(this));
  }
  get secrets() {
    return this._secrets ?? (this._secrets = new SecretManager(this));
  }
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
   * Get asset by ID (convenience delegate to venue.assets.get)
   * @param assetId - Asset identifier
   * @returns {Promise<Asset>} Returns either an Operation or DataAsset based on the asset's metadata
   */
  async getAsset(assetId) {
    return this.assets.get(assetId);
  }
  /**
   * List assets with pagination support (convenience delegate to venue.assets.list)
   * @param options - Pagination options (offset, limit)
   * @returns {Promise<AssetList>} Paginated list of asset IDs with metadata
   */
  async listAssets(options = {}) {
    return this.assets.list(options);
  }
  /**
   * List all jobs
   * @returns {Promise<string[]>}
   */
  async listJobs() {
    return this.jobs.list();
  }
  /**
   * Get job by ID
   * @param jobId - Job identifier
   * @returns {Promise<Job>}
   */
  async getJob(jobId) {
    return this.jobs.get(jobId);
  }
  /**
   * List secret names
   * @returns {Promise<string[]>}
   */
  async listSecrets() {
    const result = await fetchWithError(`${this.baseUrl}/api/v1/secrets`, {
      headers: this._buildHeaders()
    });
    return result.items;
  }
  /**
   * Store a secret value
   * @param name - Secret name
   * @param value - Secret value
   */
  async putSecret(name, value) {
    await fetchWithError(`${this.baseUrl}/api/v1/secrets/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: this._buildHeaders(),
      body: JSON.stringify({ value })
    });
  }
  /**
   * Delete a secret
   * @param name - Secret name
   */
  async deleteSecret(name) {
    await fetchStreamWithError(`${this.baseUrl}/api/v1/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: this._buildHeaders()
    });
  }
  /**
   * Get venue status
   * @returns {Promise<StatusData>}
   */
  status() {
    return fetchWithError(`${this.baseUrl}/api/v1/status`);
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
   * Close the venue and release resources.
   * Clears cached asset data for this venue.
   */
  close() {
    this.assets.clearCache();
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
  * @param auth - Optional authentication provider (BearerAuth, KeyPairAuth, etc.)
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

// src/index.ts
init_keys();
init_multikey();

exports.AgentManager = AgentManager;
exports.AgentStatus = AgentStatus;
exports.Asset = Asset;
exports.AssetManager = AssetManager;
exports.AssetNotFoundError = AssetNotFoundError;
exports.Auth = Auth;
exports.BearerAuth = BearerAuth;
exports.CoviaConnectionError = CoviaConnectionError;
exports.CoviaError = CoviaError;
exports.CoviaTimeoutError = CoviaTimeoutError;
exports.CredentialsHTTP = CredentialsHTTP;
exports.DataAsset = DataAsset;
exports.Grid = Grid;
exports.GridError = GridError;
exports.Job = Job;
exports.JobFailedError = JobFailedError;
exports.JobManager = JobManager;
exports.JobNotFoundError = JobNotFoundError;
exports.JobStatus = JobStatus;
exports.KeyPairAuth = KeyPairAuth;
exports.NoAuth = NoAuth;
exports.NotFoundError = NotFoundError;
exports.Operation = Operation;
exports.OperationManager = OperationManager;
exports.RunStatus = RunStatus;
exports.SecretManager = SecretManager;
exports.UCANManager = UCANManager;
exports.Venue = Venue;
exports.WorkspaceManager = WorkspaceManager;
exports.createSSEEvent = createSSEEvent;
exports.decodePublicKey = decodePublicKey;
exports.didFromPublicKey = didFromPublicKey;
exports.encodePublicKey = encodePublicKey;
exports.fetchStreamWithError = fetchStreamWithError;
exports.fetchWithError = fetchWithError;
exports.generateKeyPair = generateKeyPair;
exports.getAssetIdFromPath = getAssetIdFromPath;
exports.getAssetIdFromVenueId = getAssetIdFromVenueId;
exports.getParsedAssetId = getParsedAssetId;
exports.hexToPrivateKey = hexToPrivateKey;
exports.isJobComplete = isJobComplete;
exports.isJobFinished = isJobFinished;
exports.isJobPaused = isJobPaused;
exports.logger = logger;
exports.parseSSEStream = parseSSEStream;
exports.privateKeyToHex = privateKeyToHex;
