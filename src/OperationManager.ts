import { OperationInfo, InvokeOptions, JobMetadata, VenueInterface, CoviaError, JobFailedError, NotFoundError, RunStatus } from './types';
import { isJobComplete, isJobFinished } from './Utils';
import { Job } from './Job';
import { venueJson, VenueRequestContext } from './VenueTransport';

interface OperationManagerVenue extends VenueRequestContext {
  privateJobs?: boolean;
}

export class OperationManager {
  constructor(private venue: OperationManagerVenue) {}

  /**
   * List all named operations available on this venue
   */
  async list(): Promise<OperationInfo[]> {
    return venueJson<OperationInfo[]>(this.venue, '/api/v1/operations');
  }

  /**
   * Get details of a named operation
   * @param name - Operation name (e.g., "v/ops/schema/infer")
   */
  async get(name: string): Promise<OperationInfo> {
    return venueJson<OperationInfo>(this.venue, `/api/v1/operations/${name}`);
  }

  /**
   * Execute an operation and wait for the result
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Execution options (e.g., ucans or private execution)
   */
  async run<T = unknown>(assetId: string, input?: unknown, options?: InvokeOptions): Promise<T> {
    if (options?.private ?? this.venue.privateJobs) {
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
    const rec = await venueJson<JobMetadata>(this.venue, '/api/v1/invoke', {
      method: 'POST',
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
      // Only a vanished record means "completed while unobserved". A job that
      // genuinely failed, timed out, or hit a transport error must surface as
      // itself, not be misreported as an invisible success.
      if (!(e instanceof NotFoundError)) throw e;
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
    // Same precedence rule as run(): an explicit per-call `private` (true OR
    // false) overrides the deprecated connection-wide flag.
    if (options?.private ?? this.venue.privateJobs) {
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
    const response = await venueJson<JobMetadata>(this.venue, '/api/v1/invoke', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return new Job(response.id ?? '', this.venue as unknown as VenueInterface, response);
  }
}
