/**
 * Shared shaping helpers for the job-free workspace Values surface.
 */

import { CoviaError, WorkspaceSliceResult } from './types';

/** Narrow an unknown value to a plain record, else undefined. */
export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export interface SliceReader {
  slice(path: string, offset?: number, limit?: number): Promise<WorkspaceSliceResult>;
}

const SLICE_PAGE_SIZE = 200;

/**
 * Drain a sequence through paged `slice` reads — the documented fallback for
 * values too large for a single capped `read` (a truncated read withholds
 * `value` precisely so callers switch to this).
 *
 * An absent path yields `[]`; a page vanishing mid-read or failing to advance
 * is a venue fault and throws rather than silently returning a partial list.
 */
export async function sliceAll(workspace: SliceReader, path: string, pageSize = SLICE_PAGE_SIZE): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  for (;;) {
    const page = await workspace.slice(path, offset, pageSize);
    if (!page.exists) {
      if (items.length === 0) return items;
      throw new CoviaError(`Sliceable value at ${path} disappeared mid-read`);
    }
    const values: unknown[] = page.values ?? [];
    items.push(...values);
    const nextOffset = (page.offset ?? offset) + values.length;
    const done = page.count !== undefined
      ? nextOffset >= page.count
      : values.length < pageSize;
    if (values.length === 0 || done) break;
    if (nextOffset <= offset) {
      throw new CoviaError(`Venue returned a slice of ${path} that did not advance`);
    }
    offset = nextOffset;
  }
  return items;
}

/**
 * The ascending index range backing a newest-first window.
 *
 * Job and session ids are both timestamp-prefixed, so their indexes are already
 * in chronological order and "newest first" is a window taken from the end:
 * descending `[offset, offset+limit)` is ascending `[total-offset-limit,
 * total-offset)`, clamped at the start. Ordering this way holds across pages,
 * which sorting a single page after the fact does not.
 */
export function descWindow(total: number, offset: number, limit: number): [number, number] {
  const end = Math.max(0, total - offset);
  return [Math.max(0, end - limit), end];
}

/**
 * A hex id as bare lowercase hex. The venue writes a blob key in `covia:list`,
 * `covia:slice` and `covia:aggregate` results as `0x` hex since 0.11 (bare
 * before), while other results still give some ids bare (an `agent:chat`
 * `sessionId`), and its inputs take either. Ids read from a key go through
 * here so they compare equal whichever form the venue used.
 */
export function bareHex(id: string): string {
  const trimmed = id.trim();
  return (/^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed).toLowerCase();
}

/** Whether `id` is a hex id, with or without `0x`: the only ids the venue
 *  accepts for jobs and sessions since 0.11. */
export function isHexId(id: string): boolean {
  return /^[0-9a-f]+$/.test(bareHex(id));
}
