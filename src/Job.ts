import { JobMetadata, RunStatus, CoviaTimeoutError, JobFailedError, VenueInterface, SSEEvent } from "./types";
import { isJobFinished, isJobComplete } from "./Utils";
import { logger } from "./Logger";

const INITIAL_POLL_DELAY = 300;   // ms
const BACKOFF_FACTOR = 1.5;
const MAX_POLL_DELAY = 10000;     // ms

export class Job {
  public id: string;
  public venue: VenueInterface;
  public metadata: JobMetadata;

  constructor(id: string, venue: VenueInterface, metadata: JobMetadata) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
  }

  /**
   * Whether the job has reached a terminal state
   */
  get isFinished(): boolean {
    return this.metadata.status != null && isJobFinished(this.metadata.status);
  }

  /**
   * Whether the job completed successfully
   */
  get isComplete(): boolean {
    return this.metadata.status != null && isJobComplete(this.metadata.status);
  }

  /**
   * The job output.
   * @throws {Error} If the job has not finished yet.
   * @throws {JobFailedError} If the job finished with a non-COMPLETE status.
   */
  get output(): any {
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
  async refresh(): Promise<void> {
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
  async wait(options?: { timeout?: number }): Promise<void> {
    if (this.isFinished) return;

    let delay = INITIAL_POLL_DELAY;
    const start = Date.now();
    logger.debug(`Polling job ${this.id} (status: ${this.metadata.status})`);

    while (!this.isFinished) {
      if (options?.timeout !== undefined && (Date.now() - start) > options.timeout) {
        throw new CoviaTimeoutError(`Job ${this.id} did not finish within ${options.timeout}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      await this.refresh();
      logger.debug(`Job ${this.id} polled → ${this.metadata.status} (delay=${(delay / 1000).toFixed(1)}s)`);
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
  async result(options?: { timeout?: number }): Promise<any> {
    await this.wait(options);
    return this.output;
  }

  /**
   * Stream server-sent events for this job.
   * @returns AsyncGenerator yielding SSEEvent objects
   */
  async *stream(): AsyncGenerator<SSEEvent> {
    yield* this.venue.streamJobEvents(this.id);
  }

  /**
   * Cancels the execution of the job
   * @returns {Promise<number>}
   */
  async cancelJob(): Promise<number> {
   return this.venue.cancelJob(this.id);
  }

  /**
   * Delete the job
   * @returns {Promise<number>}
   */
  async deleteJob():  Promise<number> {
     return this.venue.deleteJob(this.id);
  }
}
