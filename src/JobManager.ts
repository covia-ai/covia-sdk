import {
  CoviaError, JobMetadata, SSEEvent, NotFoundError, JobNotFoundError, VenueInterface,
  JobHistoryOptions, JobHistoryPage, WorkspaceCountResult, WorkspaceSliceResult,
} from './types';
import { parseSSEStream } from './Utils';
import { Job } from './Job';
import { venueJson, VenueRequestContext, venueStream } from './VenueTransport';
import { descWindow, record } from './values-util';

interface JobManagerVenue extends VenueRequestContext {
  workspace: {
    count(path: string, opts?: { depth?: number }): Promise<WorkspaceCountResult>;
    slice(path: string, offset?: number, limit?: number): Promise<WorkspaceSliceResult>;
  };
}

/** The job index: one keyed record per job, in chronological (ascending) order. */
const JOB_INDEX = 'j';

/** Default rows per history page — a screenful, not the whole index. */
const DEFAULT_HISTORY_LIMIT = 50;

/** Largest slice attempted before the cap-aware halving kicks in. */
const MAX_SLICE_LIMIT = 100;

/**
 * The venue caps a single Values response and rejects an oversize slice rather
 * than truncating it. Job records embed their full input and output, so a
 * window of fat jobs trips the cap at modest limits — the read halves its
 * chunk and finally skips the one oversize record, degrading a window by a row
 * instead of failing it.
 */
function isSliceCapError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('exceeds maxSize');
}

/**
 * Shape `{key, value}` slice entries into JobMetadata.
 *
 * Records written before the venue carried `id` in the body are identified by
 * their index key, which is the job id in hex without the `0x` the rest of the
 * API uses.
 */
function jobRecords(values: unknown[]): JobMetadata[] {
  const records: JobMetadata[] = [];
  for (const entry of values) {
    const pair = record(entry);
    const value = record(pair?.value);
    if (!value) continue;
    const meta = value as JobMetadata;
    const key = typeof pair?.key === 'string' ? pair.key : '';
    records.push({ ...meta, id: meta.id ?? `0x${key}` });
  }
  return records;
}

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

  /**
   * A page of job history: `JobMetadata` rows, newest-first by default, with an
   * authoritative total.
   *
   * `list()` answers "which jobs exist" as ids; a history view needs a bounded
   * window of *records* and a count to page against. This reads the job index
   * directly, so each row arrives with its metadata already attached — the
   * alternative, listing ids and then fetching each one, is an N+1 fan-out per
   * page. Reads stay job-free (covia#177): paging job history must not itself
   * write a job record per page.
   *
   * The total is read before a `desc` window can be placed, so the index may
   * grow in between; the page self-corrects once against the count the slice
   * itself reports, which is authoritative for the rows returned with it.
   */
  async history(options: JobHistoryOptions = {}): Promise<JobHistoryPage> {
    const offset = Math.max(0, Math.trunc(options.offset ?? 0));
    const limit = Math.max(0, Math.trunc(options.limit ?? DEFAULT_HISTORY_LIMIT));
    const descending = (options.order ?? 'desc') === 'desc';

    if (limit === 0) {
      const { count } = await this.venue.workspace.count(JOB_INDEX);
      return { items: [], total: count ?? 0, offset, limit };
    }

    // Ascending is the index's own order, so the window is the request as given
    // and the slice's own count settles the total in one read.
    if (!descending) {
      const asc = await this._readJobRange(offset, offset + limit);
      return { items: jobRecords(asc.values), total: asc.count ?? offset + asc.values.length, offset, limit };
    }

    // Newest-first counts back from the end, so the window depends on the total.
    const guess = (await this.venue.workspace.count(JOB_INDEX)).count ?? 0;
    let read = await this._readJobRange(...descWindow(guess, offset, limit));
    const total = read.count ?? guess;
    if (total !== guess) {
      read = await this._readJobRange(...descWindow(total, offset, limit));
    }
    return { items: jobRecords(read.values).reverse(), total: read.count ?? total, offset, limit };
  }

  /**
   * Read index ranks `[start, end)` in cap-aware chunks, halving on an oversize
   * response and skipping a record that is individually oversize.
   */
  private async _readJobRange(start: number, end: number): Promise<{ count?: number; values: unknown[] }> {
    const values: unknown[] = [];
    let count: number | undefined;
    let pos = start;
    let chunk = MAX_SLICE_LIMIT;
    while (pos < end) {
      const want = Math.min(chunk, end - pos);
      try {
        const page = await this.venue.workspace.slice(JOB_INDEX, pos, want);
        count = page.count ?? count;
        const got: unknown[] = page.values ?? [];
        values.push(...got);
        if (got.length < want) break;               // the index shrank mid-read
        pos += got.length;
      } catch (error) {
        if (!isSliceCapError(error)) throw error;
        if (want > 1) {
          chunk = Math.max(1, Math.floor(want / 2));
          continue;
        }
        pos += 1;                                    // one fat job, skipped
      }
    }
    return { count, values };
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

  async *stream(jobId: string, options?: { signal?: AbortSignal }): AsyncGenerator<SSEEvent> {
    const response = await venueStream(this.venue, `/api/v1/jobs/${jobId}/sse`, {
      headers: { 'Accept': 'text/event-stream' },
      signal: options?.signal,
    });
    yield* parseSSEStream(response, { signal: options?.signal });
  }
}
