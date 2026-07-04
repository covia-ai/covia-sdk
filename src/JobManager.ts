import { JobMetadata, SSEEvent, NotFoundError, JobNotFoundError, VenueInterface } from './types';
import { fetchWithError, fetchStreamWithError, parseSSEStream } from './Utils';
import { Job } from './Job';

interface JobManagerVenue {
  baseUrl: string;
  venueId: string;
  auth: { apply(headers: Record<string, string>, audience?: string): void };
}

export class JobManager {
  constructor(private venue: JobManagerVenue) {}

  async list(): Promise<string[]> {
    return fetchWithError<string[]>(`${this.venue.baseUrl}/api/v1/jobs`, {
      headers: this._buildHeaders(),
    });
  }

  async get(jobId: string): Promise<Job> {
    try {
      const data = await fetchWithError<JobMetadata>(`${this.venue.baseUrl}/api/v1/jobs/${jobId}`, {
        headers: this._buildHeaders(),
      });
      return new Job(jobId, this.venue as unknown as VenueInterface, data);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }

  async cancel(jobId: string): Promise<JobMetadata> {
    try {
      return await fetchWithError<JobMetadata>(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/cancel`, {
        method: 'PUT',
        headers: this._buildHeaders(),
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }

  async delete(jobId: string): Promise<void> {
    try {
      await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/delete`, {
        method: 'PUT',
        headers: this._buildHeaders(),
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }

  async pause(jobId: string): Promise<JobMetadata> {
    try {
      return await fetchWithError<JobMetadata>(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/pause`, {
        method: 'PUT',
        headers: this._buildHeaders(),
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }

  async resume(jobId: string): Promise<JobMetadata> {
    try {
      return await fetchWithError<JobMetadata>(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/resume`, {
        method: 'PUT',
        headers: this._buildHeaders(),
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }

  async sendMessage(jobId: string, message: unknown): Promise<unknown> {
    try {
      return await fetchWithError<unknown>(`${this.venue.baseUrl}/api/v1/jobs/${jobId}`, {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify(message),
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new JobNotFoundError(jobId);
      }
      throw error;
    }
  }

  async *stream(jobId: string): AsyncGenerator<SSEEvent> {
    const response = await fetchStreamWithError(`${this.venue.baseUrl}/api/v1/jobs/${jobId}/sse`, {
      headers: { ...this._buildHeaders(), 'Accept': 'text/event-stream' },
    });
    yield* parseSSEStream(response);
  }

  private _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    this.venue.auth.apply(headers, this.venue.venueId);
    return headers;
  }
}
