import { fetchWithError } from './Utils';
import {
  WorkspaceReadResult, WorkspaceWriteResult, WorkspaceDeleteResult, WorkspaceAppendResult,
  WorkspaceListResult, WorkspaceSliceResult, WorkspaceCopyResult, WorkspaceInspectResult,
  WorkspaceCountResult, WorkspaceAggregateResult, InvokeOptions,
} from './types';

interface WorkspaceManagerVenue {
  baseUrl: string;
  venueId: string;
  auth: { apply(headers: Record<string, string>, audience?: string): void };
  operations: { run(assetId: string, input: any, options?: InvokeOptions): Promise<any> };
}

/**
 * Workspace (lattice) operations against a venue.
 *
 * **Reads are job-free.** `read`/`list`/`slice`/`inspect`/`count`/`aggregate` go
 * through `GET /api/v1/values/*` (covia #177) — synchronous, capability-checked,
 * and **no Job is persisted**. This matters at scale: routing reads through the
 * invoke/job path writes one durable job record per read, which grows the venue's
 * etch without bound under a read-heavy consumer.
 *
 * **Writes stay on the job path** (`write`/`delete`/`append`/`copy` via
 * `operations.run`) — a mutation *should* leave an audit record.
 *
 * Paths resolve against the caller's own DID unless fully qualified
 * (`<DID>/w/...`). Reading another DID's namespace is capability-gated: the
 * job-free GET path carries only the caller's identity token, so a read that
 * needs UCAN **proof tokens** (`ucans`) transparently falls back to the invoke
 * path (the only transport that carries a proof array). Own-namespace reads —
 * the common case — never need this and stay fully job-free.
 */
export class WorkspaceManager {
  constructor(private venue: WorkspaceManagerVenue) {}

  private _headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Bind the token to this venue's DID (JWT `aud`) — same as every other request.
    this.venue.auth.apply(headers, this.venue.venueId);
    return headers;
  }

  /** GET a job-free `/api/v1/values/{op}` read; omit undefined params. */
  private _values<T>(op: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    return fetchWithError<T>(`${this.venue.baseUrl}/api/v1/values/${op}?${qs.toString()}`, { headers: this._headers() });
  }

  // ── job-free reads (#177) ───────────────────────────────────────────────────

  async read(path: string, maxSize?: number, ucans?: string[]): Promise<WorkspaceReadResult> {
    if (ucans?.length) return this.venue.operations.run('v/ops/covia/read', { path, maxSize }, { ucans });
    return this._values('read', { path, maxSize });
  }

  async list(path?: string, limit?: number, offset?: number, ucans?: string[]): Promise<WorkspaceListResult> {
    // The GET route requires a path; a root/undefined list stays on the op path.
    if (ucans?.length || !path) return this.venue.operations.run('v/ops/covia/list', { path, limit, offset }, { ucans });
    return this._values('list', { path, limit, offset });
  }

  async slice(path: string, offset?: number, limit?: number, ucans?: string[]): Promise<WorkspaceSliceResult> {
    if (ucans?.length) return this.venue.operations.run('v/ops/covia/slice', { path, offset, limit }, { ucans });
    return this._values('slice', { path, offset, limit });
  }

  async inspect(paths: string | string[], budget?: number, compact?: boolean, ucans?: string[]): Promise<WorkspaceInspectResult> {
    // The GET route renders a single path; multi-path (or proof tokens) use the op.
    if (ucans?.length || Array.isArray(paths)) return this.venue.operations.run('v/ops/covia/inspect', { paths, budget, compact }, { ucans });
    return this._values('inspect', { path: paths, budget, compact });
  }

  /**
   * Count entries at a depth below `path` — a job-free server-side tally, so the
   * caller never reads every record to learn "how many".
   *
   * `depth` = the exact number of `get`-steps below `path` to visit (default 1 =
   * direct children). Records nested at `w/x/<bucket>/<record>` are counted with
   * `depth: 2`. Absent path or a scalar → `{exists:false}`.
   */
  async count(path: string, opts: { depth?: number; ucans?: string[] } = {}): Promise<WorkspaceCountResult> {
    const { depth, ucans } = opts;
    if (ucans?.length) return this.venue.operations.run('v/ops/covia/aggregate', { path, depth }, { ucans });
    return this._values('count', { path, depth });
  }

  /**
   * Count entries at a depth below `path`, optionally partitioned by a field —
   * the job-free, authoritative alternative to counting client-side.
   *
   * `groupBy` names the field whose value forms each group key (may be a relative
   * path, `foo/bar`); an entry missing it groups under `"null"`. Σ(group counts)
   * equals the top-level `count`.
   */
  async aggregate(path: string, opts: { depth?: number; groupBy?: string; ucans?: string[] } = {}): Promise<WorkspaceAggregateResult> {
    const { depth, groupBy, ucans } = opts;
    if (ucans?.length) return this.venue.operations.run('v/ops/covia/aggregate', { path, depth, groupBy }, { ucans });
    return this._values('aggregate', { path, depth, groupBy });
  }

  // ── writes stay on the job path (they should leave an audit record) ─────────

  async write(path: string, value: any, ucans?: string[]): Promise<WorkspaceWriteResult> {
    return this.venue.operations.run('v/ops/covia/write', { path, value }, { ucans });
  }

  async delete(path: string, ucans?: string[]): Promise<WorkspaceDeleteResult> {
    return this.venue.operations.run('v/ops/covia/delete', { path }, { ucans });
  }

  async append(path: string, value: any, ucans?: string[]): Promise<WorkspaceAppendResult> {
    return this.venue.operations.run('v/ops/covia/append', { path, value }, { ucans });
  }

  async copy(from: string, to: string, ucans?: string[]): Promise<WorkspaceCopyResult> {
    return this.venue.operations.run('v/ops/covia/copy', { from, to }, { ucans });
  }
}
