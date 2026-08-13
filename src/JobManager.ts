import { CoviaError, JobMetadata, SSEEvent, NotFoundError, JobNotFoundError, VenueInterface } from './types';
import { parseSSEStream } from './Utils';
import { Job } from './Job';
import { venueJson, VenueRequestContext, venueStream } from './VenueTransport';

type JobManagerVenue = VenueRequestContext;

interface JobPage {
  items: string[];
  total: number;
  offset: number;
  limit: number;
}

function jobPage(value: unknown): JobPage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CoviaError('Venue returned an invalid jobs listing');
  }
  const page = value as Partial<JobPage>;
  if (
    !Array.isArray(page.items) || !page.items.every((item) => typeof item === 'string') ||
    !Number.isInteger(page.total) || (page.total ?? -1) < 0 ||
    !Number.isInteger(page.offset) || (page.offset ?? -1) < 0 ||
    !Number.isInteger(page.limit) || (page.limit ?? -1) < 0
  ) {
    throw new CoviaError('Venue returned an invalid jobs page');
  }
  return page as JobPage;
}

export class JobManager {
  constructor(private venue: JobManagerVenue) {}

  async list(): Promise<string[]> {
    const items: string[] = [];
    let offset = 0;
    let targetTotal: number | undefined;

    while (targetTotal === undefined || items.length < targetTotal) {
      const body = await venueJson<unknown>(
        this.venue,
        `/api/v1/jobs?offset=${offset}&limit=1000`,
      );
      // Earlier venues returned the complete listing as a flat id array.
      if (Array.isArray(body)) {
        if (!body.every((item) => typeof item === 'string')) {
          throw new CoviaError('Venue returned an invalid jobs listing');
        }
        return body;
      }

      const page = jobPage(body);
      targetTotal ??= page.total;
      items.push(...page.items);
      if (page.items.length === 0) break;

      const nextOffset = page.offset + page.items.length;
      if (nextOffset <= offset) {
        throw new CoviaError('Venue returned a jobs page that did not advance');
      }
      offset = nextOffset;
    }
    return items;
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
