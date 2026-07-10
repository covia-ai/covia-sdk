import { CoviaError, CoviaConnectionError, GridError, NotFoundError, RateLimitError, RunStatus, SSEEvent } from './types';
import { logger } from './Logger';
import { didUrl, Namespace } from './did';

/**
 * Parse error message from an API response body.
 */
async function parseErrorBody(response: Response): Promise<{ message: string; body: unknown }> {
  let body: unknown = null;
  let message = `Request failed with status ${response.status}`;
  try {
    body = (await response.json()) as unknown;
    if (body && typeof body === 'object' && 'error' in body) {
      const err = (body as { error?: unknown }).error;
      if (typeof err === 'string') message = err;
    }
  } catch {
    try {
      const text = await response.text();
      if (text) message = text;
    } catch {
      // use default message
    }
  }
  return { message, body };
}

/**
 * Throw the appropriate error subclass for an HTTP error response.
 */
async function throwHttpError(response: Response): Promise<never> {
  const { message, body } = await parseErrorBody(response);
  if (response.status === 404) {
    throw new NotFoundError(message);
  }
  throw new GridError(response.status, message, body);
}

/**
 * Wrap a non-CoviaError into the appropriate subclass.
 */
function wrapError(error: unknown): CoviaError {
  if (error instanceof CoviaError) return error;
  const msg = (error as Error).message ?? String(error);
  // Detect network/connection errors from fetch
  if (error instanceof TypeError) {
    return new CoviaConnectionError(msg);
  }
  return new CoviaError(`Request failed: ${msg}`);
}

/**
 * Utility function to handle API calls with consistent error handling
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns {Promise<T>} The response data
 */
// ── 429 backpressure (covia-sdk#14) ─────────────────────────────────────────
// Venues shed load with 429 + Retry-After (request rate limit / concurrent-job
// cap). A 429 means the request was refused BEFORE any effect (no job created),
// so it is safe to retry automatically — even POST /invoke. Policy mirrors the
// Java client (covia-core RetryPolicy): Retry-After is the floor, backoff uses
// FULL jitter (randomise the whole interval — otherwise every client that got
// the same Retry-After re-stampedes together), attempts and total wait are
// bounded, and exhaustion throws a typed RateLimitError.
const RETRY_MAX_ATTEMPTS = 4;      // 1 try + 3 retries
const RETRY_BASE_MS = 200;
const RETRY_MAX_DELAY_MS = 10_000;
const RETRY_BUDGET_MS = 30_000;

/** Parse a Retry-After header (delta-seconds or HTTP-date) to ms from now. */
export function parseRetryAfterMs(header: string | null, nowMs: number): number {
  if (!header) return 0;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : 0;
}

/** Delay before the next attempt after a 429, or -1 to give up. Pure — random
 *  in [0,1) supplied by the caller so tests are deterministic. */
export function retryDelayMs(attempt: number, retryAfterMs: number,
    remainingBudgetMs: number, random: number): number {
  if (attempt >= RETRY_MAX_ATTEMPTS) return -1;
  const backoff = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
  const delay = Math.max(retryAfterMs, Math.floor(random * backoff));
  return delay > remainingBudgetMs ? -1 : delay;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function fetchWithError<T>(url: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? 'GET';
  const deadline = Date.now() + RETRY_BUDGET_MS;
  for (let attempt = 1; ; attempt++) {
    logger.debug(`${method} ${url}`);
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      const msg = (error as Error).message ?? String(error);
      logger.debug(`Connection failed: ${method} ${url} — ${msg}`);
      throw wrapError(error);
    }
    logger.debug(`${method} ${url} → ${response.status}`);
    if (response.status === 429) {
      const now = Date.now();
      const retryAfterMs = parseRetryAfterMs(response.headers?.get?.('Retry-After') ?? null, now);
      const delay = retryDelayMs(attempt, retryAfterMs, deadline - now, Math.random());
      if (delay < 0) {
        const { message, body } = await parseErrorBody(response);
        throw new RateLimitError(message, Math.max(1, Math.ceil(retryAfterMs / 1000)), body);
      }
      logger.debug(`429 from ${url}; retrying in ${delay}ms (attempt ${attempt})`);
      await sleep(delay);
      continue;
    }
    if (!response.ok) {
      await throwHttpError(response);
    }
    return response.json() as Promise<T>;
  }
}

/**
 * Utility function to handle fetch requests that return streams
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
export async function fetchStreamWithError(url: string, options?: RequestInit): Promise<Response> {
  const method = options?.method ?? 'GET';
  logger.debug(`${method} ${url}`);
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    logger.debug(`Connection failed: ${method} ${url} — ${msg}`);
    throw wrapError(error);
  }
  logger.debug(`${method} ${url} → ${response.status}`);
  if (!response.ok) {
    await throwHttpError(response);
  }
  return response;
}
/**
 * Utility function to check if job is considered completed
 * @param jobStatus - The status of the job
 * @returns {boolean} - Returns false if job is not completed , else returns true
 */
export function isJobComplete(jobStatus: RunStatus): boolean {
  return jobStatus === RunStatus.COMPLETE;
}
/**
 * Utility function to check if job is considered paused
 * @param jobStatus - The status of the job
 * @returns {boolean} - Returns false if job is not paused , else returns true
 */
export function isJobPaused(jobStatus:RunStatus): boolean {
  if(jobStatus == null)
      return false;
  return jobStatus == RunStatus.PAUSED
      || jobStatus == RunStatus.INPUT_REQUIRED
      || jobStatus == RunStatus.AUTH_REQUIRED;
}
/**
 * Utility function to check if job is considered finished
 * @param jobStatus - The status of the job
 * @returns {boolean} - Returns false if job is not finished , else returns true
 */
export function isJobFinished(jobStatus:RunStatus): boolean {
  if(jobStatus == null)
      return false;

  if (jobStatus == RunStatus.COMPLETE) return true;
  if (jobStatus == RunStatus.FAILED) return true;
  if (jobStatus == RunStatus.REJECTED) return true;
  if (jobStatus == RunStatus.CANCELLED) return true;
  if (jobStatus == RunStatus.TIMEOUT) return true;

  return false;
}
/**
 * Utility function to parse the asset hex from the compelte assetId
 * @param assetId - The complete assetId
 * @returns {string} - Returns the parsed hexIdof the asset
 */
export function getParsedAssetId(assetId: string): string {
  // For any DID URL (did:web, did:key, …) the trailing segment is the hex id.
  if (assetId.startsWith("did:")) {
    const parts = assetId.split("/");
    return parts[parts.length - 1];
  }
  return assetId;
}
/**
 * Utility function to return complete assetId from hex and an API path of the
 * form `/api/v1/assets/<encoded-did>/...`.
 * @param assetHex - The asset hex
 * @param assetPath - The asset path
 * @returns {string} - Returns the complete assetId
 */
export function getAssetIdFromPath(assetHex: string, assetPath: string): string {
  // Locate the segment after "assets" rather than assuming a fixed index.
  const parts = assetPath.split("/");
  const i = parts.indexOf("assets");
  const venueDid = decodeURIComponent(i >= 0 && i + 1 < parts.length ? parts[i + 1] : "");
  return getAssetIdFromVenueId(assetHex, venueDid);
}
export function getAssetIdFromVenueId(assetHex: string, venueId: string): string {
  return didUrl(venueId, Namespace.ASSET, assetHex);
}

/**
 * Create an SSEEvent object from parsed fields.
 */
export function createSSEEvent(fields: { event?: string; data?: string; id?: string; retry?: number }): SSEEvent {
  const data = fields.data ?? '';
  return {
    event: fields.event || null,
    data,
    id: fields.id || null,
    retry: fields.retry ?? null,
    json() { return JSON.parse(data) as unknown; },
  };
}

/**
 * Parse an SSE stream from a fetch Response body.
 * Yields SSEEvent objects as they arrive.
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | undefined;
  let data: string[] = [];
  let id: string | undefined;
  let retry: number | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line === '') {
          // Empty line = end of event
          if (data.length > 0 || event !== undefined) {
            yield createSSEEvent({
              event,
              data: data.join('\n'),
              id,
              retry,
            });
            event = undefined;
            data = [];
            id = undefined;
            retry = undefined;
          }
          continue;
        }

        if (line.startsWith(':')) continue; // Comment line

        const colonIdx = line.indexOf(':');
        let field: string;
        let val: string;

        if (colonIdx === -1) {
          field = line;
          val = '';
        } else {
          field = line.slice(0, colonIdx);
          val = line.slice(colonIdx + 1);
          if (val.startsWith(' ')) val = val.slice(1);
        }

        switch (field) {
          case 'event': event = val; break;
          case 'data': data.push(val); break;
          case 'id': id = val; break;
          case 'retry': {
            const n = parseInt(val, 10);
            if (!isNaN(n)) retry = n;
            break;
          }
        }
      }
    }
    // Flush any remaining event
    if (data.length > 0 || event !== undefined) {
      yield createSSEEvent({ event, data: data.join('\n'), id, retry });
    }
  } finally {
    reader.releaseLock();
  }
}

