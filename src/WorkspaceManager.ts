import {
  WorkspaceReadResult, WorkspaceWriteResult, WorkspaceDeleteResult, WorkspaceAppendResult,
  WorkspaceListResult, WorkspaceSliceResult, WorkspaceCopyResult, WorkspaceInspectResult,
  WorkspaceCountResult, WorkspaceAggregateResult, OperationRunner, NotFoundError,
  UnsupportedVenueFeatureError, ExecutionScope, CoviaError,
  WorkspaceFieldValue, WorkspaceProjectedList,
} from './types';
import { venueJson, VenueRequestContext } from './VenueTransport';
import { ROUTE_MISSING_404 } from './venue-features';

interface WorkspaceManagerVenue extends VenueRequestContext {
  operations: OperationRunner;
}

/** The execution-scoped shorthands the venue expands from explicit selectors. */
const SCOPED_NAMESPACES = ['t', 'n', 'c'] as const;

type ScopedNamespace = (typeof SCOPED_NAMESPACES)[number];

/**
 * A pre-covia#230 venue has no selector expansion, so it passes the shorthand
 * straight to the lattice, where the namespace resolver rejects it for want of
 * execution context. That exact complaint is how the SDK learns to expand
 * client-side; any other error is a real one and propagates.
 */
const SCOPE_UNEXPANDED = /Cannot use '[tnc]\/' prefix outside/;

/** The venue's cap on a `fields` projection (CoviaAdapter.MAX_PROJECT_FIELDS). */
const MAX_PROJECT_FIELDS = 16;

/** The scoped namespace a path opens with, or undefined for an ordinary path. */
function scopedNamespaceOf(path: string): ScopedNamespace | undefined {
  const head = path.split('/', 1)[0];
  return (SCOPED_NAMESPACES as readonly string[]).includes(head)
    ? head as ScopedNamespace
    : undefined;
}

/** The selectors this namespace consumes — the venue 400s on any other. */
function scopeParamsFor(ns: ScopedNamespace, scope: ExecutionScope): Record<string, string> {
  const { agent, task, session } = scope;
  switch (ns) {
    case 'n': return { agent };
    case 'c':
      if (!session) throw new CoviaError("A 'c/' scratch read needs a session in its scope");
      return { agent, session };
    case 't':
      if (!task) throw new CoviaError("A 't/' scratch read needs a task in its scope");
      return { agent, task };
  }
}

/**
 * The client-side equivalent of the venue's expansion, for venues predating
 * covia#230. Mirrors TempNamespaceResolver/AgentNamespaceResolver/
 * SessionNamespaceResolver exactly; the relative result resolves against the
 * caller's own DID, so it only holds for the caller's own agent.
 */
function expandScopedPath(path: string, ns: ScopedNamespace, scope: ExecutionScope): string {
  if (scope.agent.startsWith('did:')) {
    throw new CoviaError(
      'This venue cannot expand scoped scratch paths and the SDK cannot do it for '
      + 'a DID-qualified agent — pass a bare agent id, or upgrade the venue (covia#230)',
    );
  }
  const suffix = path.slice(ns.length); // keeps the leading '/', or '' for a bare prefix
  switch (ns) {
    case 'n': return `g/${scope.agent}/n${suffix}`;
    case 'c': return `g/${scope.agent}/sessions/${scope.session}/c${suffix}`;
    case 't': return `j/${scope.task}/temp${suffix}`;
  }
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

  // Whether this venue expands t/, n/ and c/ from explicit agent/task/session
  // selectors (covia#230) — flipped off the first time a venue answers a
  // selector-bearing read by complaining the shorthand has no execution scope,
  // after which scoped reads expand client-side instead.
  private scopeExpansionSupported = true;

  // Whether this venue projects fields on `list` (covia#191). A venue without
  // it ignores the unknown `fields` param and answers a plain list, so the
  // probe is "asked for fields, got no values" — never a version check, which
  // covia-sdk#36 showed an embedded venue can misreport.
  private fieldsSupported = true;

  constructor(private venue: WorkspaceManagerVenue) {}

  /** GET a job-free `/api/v1/values/{op}` read; omit undefined params. */
  private _values<T>(op: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    return venueJson<T>(this.venue, `/api/v1/values/${op}?${qs.toString()}`);
  }

  /**
   * Whether the venue serves `GET /api/v1/values/*`: no if a probe already
   * 404'd. No version fast-path — a venue's self-reported version is weaker
   * evidence than its answer to the request (an embedded venue can report
   * its host application's version instead of its own; see covia-sdk#36).
   * Rely purely on the lazy 404 latch, same as UserManager.usersGet.
   */
  private supportsValues(): boolean {
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

  /**
   * A job-free Values read of an execution-scoped path, preferring the venue's
   * own selector expansion and falling back to the client-side one.
   *
   * The venue is preferred because it expands *before* the capability check, so
   * authorisation applies to the same canonical resource that is ultimately
   * read — a caller cannot substitute a sibling or foreign agent's scratch.
   * The fallback reaches the same resource but re-derives the layout here.
   */
  private async scopedRead<T>(
    op: string,
    params: Record<string, string | number | boolean | undefined>,
    scope: ExecutionScope,
  ): Promise<T> {
    const path = String(params.path ?? '');
    const ns = scopedNamespaceOf(path);
    // An ordinary path through a scoped handle is just an ordinary read: the
    // venue rejects selectors that no shorthand consumes.
    if (!ns) return this.valuesRead<T>(op, params);

    if (this.scopeExpansionSupported) {
      try {
        return await this.valuesRead<T>(op, { ...params, ...scopeParamsFor(ns, scope) });
      } catch (e) {
        if (!(e instanceof Error) || !SCOPE_UNEXPANDED.test(e.message)) throw e;
        this.scopeExpansionSupported = false;
      }
    }
    // Validate the scope even on the fallback path, so a missing session/task
    // fails the same way against either venue generation.
    scopeParamsFor(ns, scope);
    return this.valuesRead<T>(op, { ...params, path: expandScopedPath(path, ns, scope) });
  }

  /**
   * Bind an execution scope, giving job-free reads of the `t/`, `n/` and `c/`
   * scratch shorthands that a bare GET cannot otherwise resolve (covia#177
   * forbids minting a Job for a read; the shorthands need context a GET lacks).
   *
   * ```ts
   * const scratch = venue.workspace.scoped({ agent: 'alice', task: taskId });
   * await scratch.read('t/snapshot');
   * await scratch.list('t/');
   * ```
   *
   * Ordinary paths still work through the handle, so a caller rendering a task
   * inspector can use one reader for both scratch and workspace. Capability
   * behaviour is unchanged: the caller needs read caps on the agent's subtree.
   */
  scoped(scope: ExecutionScope): ScopedWorkspace {
    return new ScopedWorkspace(this, scope);
  }

  /** @internal — the scoped read used by {@link ScopedWorkspace}. */
  _scopedRead<T>(
    op: string,
    params: Record<string, string | number | boolean | undefined>,
    scope: ExecutionScope,
  ): Promise<T> {
    return this.scopedRead<T>(op, params, scope);
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

  /**
   * List a node's children *and* read named subpaths of each one, in a single
   * round trip (covia#191) — the standard partial-response / sparse-fieldset
   * pattern, and the cure for the collection-view N+1 that list-then-read-each
   * forces on every page.
   *
   * ```ts
   * const page = await venue.workspace.listFields('j', ['status', 'meta/updated'], { limit: 50 });
   * page.values['<jobid>']['status']; // → { exists: true, value: 'COMPLETE' }
   * ```
   *
   * Each field is defined as a `read` of `<path>/<key>/<field>` and carries
   * single-read semantics verbatim: stored null is present, absent is
   * `{exists:false}`, and a value past `maxSize` withholds `value` and sets
   * `truncated`. Projection applies *after* the `limit`/`offset` key page, so
   * work is bounded by `limit × fields.length`.
   *
   * Output shape only — no filtering, no ordering. Filter the projected
   * records locally; for a recency subset use key design plus `slice`.
   *
   * On a venue that predates projection this falls back to `list()` plus a
   * bounded `read()` per (key, field), returning the identical shape, and
   * remembers not to ask that venue again.
   *
   * @param path Parent node. Must be a keyed node (map/Index) — a sequence or
   *   scalar is a venue 400.
   * @param fields Subpaths to project per key; may be nested (`meta/updated`).
   *   At most 16, the venue's cap.
   */
  async listFields(
    path: string,
    fields: string[],
    opts: { limit?: number; offset?: number; maxSize?: number } = {},
  ): Promise<WorkspaceProjectedList> {
    const { limit, offset, maxSize } = opts;
    if (fields.length === 0) throw new CoviaError('listFields needs at least one field');
    // The venue caps at 16 and 400s past it. A named error beats a round trip
    // that comes back as an opaque bad request.
    if (fields.length > MAX_PROJECT_FIELDS) {
      throw new CoviaError(
        `A fields projection may name at most ${MAX_PROJECT_FIELDS} subpaths; got ${fields.length}`,
      );
    }

    if (this.fieldsSupported) {
      const result = await this.valuesRead<WorkspaceListResult & { values?: WorkspaceProjectedList['values'] }>(
        'list',
        { path, limit, offset, fields: fields.join(','), maxSize },
      );
      // An absent or non-keyed node never projects; pass those through as-is
      // rather than reading them as evidence the venue lacks the feature.
      if (result.values) return result as WorkspaceProjectedList;
      if (!result.exists || result.keys === undefined) return { ...result, values: {} };
      this.fieldsSupported = false;
    }
    return this.projectClientSide(path, fields, { limit, offset, maxSize });
  }

  /**
   * The pre-covia#191 fallback: one `list`, then a `read` per (key, field).
   * Fan-out is bounded by the page the list already returned, so this costs
   * `keys.length × fields.length` reads for the page — exactly the N+1 the
   * server-side projection exists to remove, which is why it is the fallback
   * and not the default.
   */
  private async projectClientSide(
    path: string,
    fields: string[],
    opts: { limit?: number; offset?: number; maxSize?: number },
  ): Promise<WorkspaceProjectedList> {
    const base = await this.valuesRead<WorkspaceListResult>(
      'list',
      { path, limit: opts.limit, offset: opts.offset },
    );
    const keys = base.keys ?? [];
    const parent = path.replace(/\/+$/, '');
    const rows = await Promise.all(keys.map(async (key) => {
      const projected = await Promise.all(fields.map(async (field): Promise<[string, WorkspaceFieldValue]> => {
        // A projected field *is* a read of that subpath — same envelope, same
        // size guard, `valueBytes` and all — so the read result is passed
        // through whole rather than narrowed. Verified against a live 0.9.8
        // venue: its projection emits the identical shape.
        return [field, await this.read(`${parent}/${key}/${field}`, opts.maxSize)];
      }));
      return [key, Object.fromEntries(projected)] as const;
    }));
    return { ...base, values: Object.fromEntries(rows) };
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

/**
 * A {@link WorkspaceManager} bound to one execution scope, so `t/`, `n/` and
 * `c/` scratch resolve without the caller hand-building the physical paths
 * (`g/<agent>/sessions/<sid>/c/...` and friends). Reads only — scoped scratch
 * is written from inside the execution that owns it, where the shorthands
 * already resolve from the request's own context.
 *
 * Obtained from {@link WorkspaceManager.scoped}; every method mirrors the
 * job-free read of the same name.
 */
export class ScopedWorkspace {
  constructor(
    private workspace: WorkspaceManager,
    /** The scope every read on this handle resolves against. */
    public readonly scope: ExecutionScope,
  ) {}

  read(path: string, maxSize?: number): Promise<WorkspaceReadResult> {
    return this.workspace._scopedRead('read', { path, maxSize }, this.scope);
  }

  list(path: string, limit?: number, offset?: number): Promise<WorkspaceListResult> {
    return this.workspace._scopedRead('list', { path, limit, offset }, this.scope);
  }

  slice(path: string, offset?: number, limit?: number): Promise<WorkspaceSliceResult> {
    return this.workspace._scopedRead('slice', { path, offset, limit }, this.scope);
  }

  inspect(path: string, budget?: number, compact?: boolean): Promise<WorkspaceInspectResult> {
    return this.workspace._scopedRead('inspect', { path, budget, compact }, this.scope);
  }

  count(path: string, opts: { depth?: number } = {}): Promise<WorkspaceCountResult> {
    return this.workspace._scopedRead('count', { path, depth: opts.depth }, this.scope);
  }

  aggregate(path: string, opts: { depth?: number; groupBy?: string } = {}): Promise<WorkspaceAggregateResult> {
    return this.workspace._scopedRead('aggregate', { path, depth: opts.depth, groupBy: opts.groupBy }, this.scope);
  }
}
