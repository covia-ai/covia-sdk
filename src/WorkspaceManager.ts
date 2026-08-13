import {
  WorkspaceReadResult, WorkspaceWriteResult, WorkspaceDeleteResult, WorkspaceAppendResult,
  WorkspaceListResult, WorkspaceSliceResult, WorkspaceCopyResult, WorkspaceInspectResult,
  WorkspaceCountResult, WorkspaceAggregateResult, OperationRunner, NotFoundError, StatusData,
  UnsupportedVenueFeatureError,
} from './types';
import { venueJson, VenueRequestContext } from './VenueTransport';
import { ROUTE_MISSING_404, versionAtLeast } from './venue-features';

interface WorkspaceManagerVenue extends VenueRequestContext {
  operations: OperationRunner;
  lastKnownStatus?: StatusData;
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
 * (`<DID>/w/...`). Reads that require proof tokens, multi-path inspection, or
 * a pre-0.3 venue cannot use the Values GET surface and reject by default.
 * Applications may explicitly invoke the corresponding operation when
 * creating a persisted job is intended.
 */
export class WorkspaceManager {
  // Whether this venue serves GET /api/v1/values/* — flipped on the first 404
  // so pre-0.3 venues pay the probe once, not one failed GET per read.
  private valuesSupported = true;

  constructor(private venue: WorkspaceManagerVenue) {}

  /** GET a job-free `/api/v1/values/{op}` read; omit undefined params. */
  private _values<T>(op: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    return venueJson<T>(this.venue, `/api/v1/values/${op}?${qs.toString()}`);
  }

  /**
   * Whether the venue serves `GET /api/v1/values/*`: no if a probe already
   * 404'd, or if the venue's last known status identifies it as pre-0.3
   * (venues that old don't report a `version` at all). Checked per read —
   * connect/`status()` may populate the status after this manager exists.
   */
  private supportsValues(): boolean {
    if (!this.valuesSupported) return false;
    const status = this.venue.lastKnownStatus;
    if (status && (!status.version || !versionAtLeast(status.version, 0, 3))) {
      this.valuesSupported = false;
    }
    return this.valuesSupported;
  }

  private unsupported<T>(feature: string): Promise<T> {
    throw new UnsupportedVenueFeatureError(feature);
  }

  /** A job-free Values read that rejects when the endpoint is unavailable. */
  private async valuesRead<T>(
    op: string,
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    if (this.supportsValues()) {
      try {
        return await this._values<T>(op, params);
      } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
        // An absent PATH answers {exists:false} with status 200, so a mapped
        // values route never 404s per-resource — but a reverse proxy or
        // mid-deploy gateway can. Only the distinctive unmapped-endpoint body
        // proves the route is absent (pre-0.3 venue) and may latch it off for
        // this connection; any other 404 propagates (cf. AgentManager,
        // covia#180 — a stray 404 must not permanently downgrade all reads).
        if (!ROUTE_MISSING_404.test(e.message)) throw e;
        this.valuesSupported = false;
      }
    }
    return this.unsupported(`workspace ${op} reads`);
  }

  // ── job-free reads (#177) ───────────────────────────────────────────────────

  async read(path: string, maxSize?: number, ucans?: string[]): Promise<WorkspaceReadResult> {
    if (ucans?.length) return this.unsupported('UCAN-authorised workspace reads');
    return this.valuesRead('read', { path, maxSize });
  }

  async list(path?: string, limit?: number, offset?: number, ucans?: string[]): Promise<WorkspaceListResult> {
    // The GET route requires a non-empty path but serves the root as "/", so a
    // root/undefined list normalises to "/" and stays job-free — previously it
    // was forced onto the op path, minting a Job for every root listing.
    path = path || '/';
    if (ucans?.length) return this.unsupported('UCAN-authorised workspace listings');
    return this.valuesRead('list', { path, limit, offset });
  }

  async slice(path: string, offset?: number, limit?: number, ucans?: string[]): Promise<WorkspaceSliceResult> {
    if (ucans?.length) return this.unsupported('UCAN-authorised workspace slices');
    return this.valuesRead('slice', { path, offset, limit });
  }

  async inspect(paths: string | string[], budget?: number, compact?: boolean, ucans?: string[]): Promise<WorkspaceInspectResult> {
    // The GET route renders a single path; multi-path (or proof tokens) use the op.
    if (ucans?.length || Array.isArray(paths)) return this.unsupported(
      Array.isArray(paths) ? 'multi-path workspace inspection' : 'UCAN-authorised workspace inspection',
    );
    return this.valuesRead('inspect', { path: paths, budget, compact });
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
    if (ucans?.length) return this.unsupported('UCAN-authorised workspace counts');
    return this.valuesRead('count', { path, depth });
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
    if (ucans?.length) return this.unsupported('UCAN-authorised workspace aggregation');
    return this.valuesRead('aggregate', { path, depth, groupBy });
  }

  // ── writes stay on the job path (they should leave an audit record) ─────────

  async write(path: string, value: unknown, ucans?: string[]): Promise<WorkspaceWriteResult> {
    return this.venue.operations.run<WorkspaceWriteResult>('v/ops/covia/write', { path, value }, { ucans });
  }

  async delete(path: string, ucans?: string[]): Promise<WorkspaceDeleteResult> {
    return this.venue.operations.run<WorkspaceDeleteResult>('v/ops/covia/delete', { path }, { ucans });
  }

  async append(path: string, value: unknown, ucans?: string[]): Promise<WorkspaceAppendResult> {
    return this.venue.operations.run<WorkspaceAppendResult>('v/ops/covia/append', { path, value }, { ucans });
  }

  async copy(from: string, to: string, ucans?: string[]): Promise<WorkspaceCopyResult> {
    return this.venue.operations.run<WorkspaceCopyResult>('v/ops/covia/copy', { from, to }, { ucans });
  }
}
