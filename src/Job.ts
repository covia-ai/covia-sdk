import { JobMetadata, RunStatus, CoviaTimeoutError, JobFailedError, VenueInterface, SSEEvent } from "./types";
import { isJobFinished, isJobComplete, isJobPaused } from "./Utils";
import { logger } from "./Logger";

const INITIAL_POLL_DELAY = 300;   // ms
const BACKOFF_FACTOR = 1.5;
const MAX_POLL_DELAY = 10000;     // ms

/** Minimal interface for the job operations Job needs from the venue's JobManager. */
interface JobOps {
  cancel(jobId: string): Promise<JobMetadata>;
  delete(jobId: string): Promise<void>;
  pause(jobId: string): Promise<JobMetadata>;
  resume(jobId: string): Promise<JobMetadata>;
  sendMessage(jobId: string, message: unknown): Promise<unknown>;
  stream(jobId: string): AsyncGenerator<SSEEvent>;
}

export class Job {
  public id: string;
  public venue: VenueInterface;
  public metadata: JobMetadata;
  private _jobs: JobOps;

  constructor(id: string, venue: VenueInterface, metadata: JobMetadata) {
    this.id = id;
    this.venue = venue;
    this.metadata = metadata;
    this._jobs = (venue as unknown as { jobs: JobOps }).jobs;
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
  get output(): unknown {
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
  async result(options?: { timeout?: number }): Promise<unknown> {
    await this.wait(options);
    return this.output;
  }

  /**
   * Stream server-sent events for this job.
   * @returns AsyncGenerator yielding SSEEvent objects
   */
  async *stream(): AsyncGenerator<SSEEvent> {
    yield* this._jobs.stream(this.id);
  }

  /**
   * Whether the job is paused (PAUSED, INPUT_REQUIRED, or AUTH_REQUIRED)
   */
  get isPaused(): boolean {
    return this.metadata.status != null && isJobPaused(this.metadata.status);
  }

  /**
   * Whether the job requires user input
   */
  get needsInput(): boolean {
    return this.metadata.status === RunStatus.INPUT_REQUIRED;
  }

  /**
   * Whether the job requires authentication
   */
  get needsAuth(): boolean {
    return this.metadata.status === RunStatus.AUTH_REQUIRED;
  }

  /**
   * Send a message to the running job
   * @param message - Message payload
   * @returns {Promise<any>}
   */
  async sendMessage(message: unknown): Promise<unknown> {
    return this._jobs.sendMessage(this.id, message);
  }

  /**
   * Pause the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async pause(): Promise<JobMetadata> {
    this.metadata = await this._jobs.pause(this.id);
    return this.metadata;
  }

  /**
   * Resume the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async resume(): Promise<JobMetadata> {
    this.metadata = await this._jobs.resume(this.id);
    return this.metadata;
  }

  /**
   * Cancel the job
   * @returns {Promise<JobMetadata>} Updated job metadata
   */
  async cancel(): Promise<JobMetadata> {
    this.metadata = await this._jobs.cancel(this.id);
    return this.metadata;
  }

  /**
   * Delete the job
   */
  async delete(): Promise<void> {
    return this._jobs.delete(this.id);
  }
}
