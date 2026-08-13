import { JobMetadata, SSEEvent, NotFoundError, JobNotFoundError, VenueInterface } from './types';
import { parseSSEStream } from './Utils';
import { Job } from './Job';
import { venueJson, VenueRequestContext, venueStream } from './VenueTransport';

type JobManagerVenue = VenueRequestContext;

export class JobManager {
  constructor(private venue: JobManagerVenue) {}

  async list(): Promise<string[]> {
    const body = await venueJson<unknown>(this.venue, '/api/v1/jobs');
    // Venue 0.6.0 returns a paged {items, total, offset, limit} envelope
    // (covia#229); earlier venues returned a flat id array. Accept both so
    // one SDK spans the upgrade.
    if (Array.isArray(body)) return body as string[];
    const items = (body as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as string[]) : [];
  }

  async get(jobId: string): Promise<Job> {
    try {
      const data = await venueJson<JobMetadata>(this.venue, `/api/v1/jobs/${jobId}`);
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
      return await venueJson<JobMetadata>(this.venue, `/api/v1/jobs/${jobId}/cancel`, {
        method: 'PUT',
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
      await venueStream(this.venue, `/api/v1/jobs/${jobId}/delete`, {
        method: 'PUT',
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
      return await venueJson<JobMetadata>(this.venue, `/api/v1/jobs/${jobId}/pause`, {
        method: 'PUT',
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
      return await venueJson<JobMetadata>(this.venue, `/api/v1/jobs/${jobId}/resume`, {
        method: 'PUT',
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
      return await venueJson<unknown>(this.venue, `/api/v1/jobs/${jobId}`, {
        method: 'POST',
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
    const response = await venueStream(this.venue, `/api/v1/jobs/${jobId}/sse`, {
      headers: { 'Accept': 'text/event-stream' },
    });
    yield* parseSSEStream(response);
  }
}
