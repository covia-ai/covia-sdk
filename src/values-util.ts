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
