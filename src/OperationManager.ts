import { OperationInfo, InvokeOptions, JobMetadata, VenueInterface, CoviaError, JobFailedError, RunStatus } from './types';
import { fetchWithError, isJobComplete, isJobFinished } from './Utils';
import { Job } from './Job';

interface OperationManagerVenue {
  baseUrl: string;
  venueId: string;
  auth: { apply(headers: Record<string, string>, audience?: string): void };
  privateJobs?: boolean;
}

export class OperationManager {
  constructor(private venue: OperationManagerVenue) {}

  /**
   * List all named operations available on this venue
   */
  async list(): Promise<OperationInfo[]> {
    return fetchWithError<OperationInfo[]>(`${this.venue.baseUrl}/api/v1/operations`);
  }

  /**
   * Get details of a named operation
   * @param name - Operation name (e.g., "v/ops/schema/infer")
   */
  async get(name: string): Promise<OperationInfo> {
    return fetchWithError<OperationInfo>(`${this.venue.baseUrl}/api/v1/operations/${name}`);
  }

  /**
   * Execute an operation and wait for the result
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Invoke options (e.g., ucans)
   */
  async run<T = unknown>(assetId: string, input?: unknown, options?: InvokeOptions): Promise<T> {
    if (this.venue.privateJobs) {
      return this._runPrivate<T>(assetId, input, options);
    }
    const job = await this.invoke(assetId, input, options);
    return (await job.result()) as T;
  }

  /**
   * Private-mode execution (covia #192): a memory-only job whose result is
   * collected through the invoke `wait` window — a completed private job is
   * immediately forgotten by the venue, so polling cannot be used. If the
   * operation outlives the venue's wait cap, polling continues while the job
   * runs; a job that completes between polls is unobservable and surfaces as
   * a clear error rather than a confusing 404.
   */
  private async _runPrivate<T>(assetId: string, input?: unknown, options?: InvokeOptions): Promise<T> {
    const payload: Record<string, unknown> = {
      operation: assetId,
      input: input,
      private: true,
      wait: true,
    };
    if (options?.ucans) payload.ucans = options.ucans;
    const rec = await fetchWithError<JobMetadata>(`${this.venue.baseUrl}/api/v1/invoke`, {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(payload),
    });
    // Terminality is decided from the invoke response — a private job's
    // record only exists there, never via polling.
    const status = rec.status as RunStatus;
    if (isJobComplete(status)) return rec.output as T;
    if (isJobFinished(status)) {
      throw new JobFailedError(rec);
    }
    // Wait window expired with the job still running — poll while it lives.
    try {
      const job = new Job(rec.id ?? '', this.venue as unknown as VenueInterface, rec);
      return (await job.result()) as T;
    } catch (e) {
      throw new CoviaError(
        'Private job completed while unobserved — its record is already forgotten, so the ' +
        'result could not be collected. Private jobs that outlive the venue wait window ' +
        `cannot be reliably collected; consider a non-private run for long operations. (${(e as Error).message})`);
    }
  }

  /**
   * Execute an operation and return a Job for tracking
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Invoke options (e.g., ucans)
   */
  async invoke(assetId: string, input?: unknown, options?: InvokeOptions): Promise<Job> {
    if (this.venue.privateJobs) {
      throw new CoviaError(
        'Private-jobs mode requires run(): a completed private job is immediately forgotten ' +
        'by the venue, so a poll-style Job cannot collect its result.');
    }
    const payload: Record<string, unknown> = {
      operation: assetId,
      input: input
    };
    if (options?.ucans) {
      payload.ucans = options.ucans;
    }
    const response = await fetchWithError<JobMetadata>(`${this.venue.baseUrl}/api/v1/invoke`, {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(payload),
    });
    return new Job(response.id ?? '', this.venue as unknown as VenueInterface, response);
  }

  private _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    this.venue.auth.apply(headers, this.venue.venueId);
    return headers;
  }
}
