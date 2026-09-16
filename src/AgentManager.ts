import { AgentCreateInput, AgentCreateResult, AgentEvent, AgentRequestResult, AgentMessageResult, AgentChatResult, AgentTriggerResult, AgentListResult, AgentDeleteResult, AgentSuspendResult, AgentUpdateInput, AgentInfoResult, AgentForkInput, AgentForkResult, AgentCompleteTaskResult, AgentFailTaskResult, AgentRenameSessionResult, AgentSession, AgentSessionListOptions, AgentSessionMessage, AgentSessionMetadata, AgentSessionNotFoundError, AgentSessionPage, OperationRunner, NotFoundError, UnsupportedVenueFeatureError, WorkspaceReadResult, WorkspaceSliceResult, WorkspaceCountResult } from './types';
import { parseSSEStream } from './Utils';
import { venueJson, venueStream, VenueRequestContext } from './VenueTransport';
import { ROUTE_MISSING_404 } from './venue-features';
import { descWindow, record, sliceAll } from './values-util';

interface AgentManagerVenue extends VenueRequestContext {
  operations: OperationRunner;
  workspace: {
    read(path: string, maxSize?: number): Promise<WorkspaceReadResult>;
    slice(path: string, offset?: number, limit?: number): Promise<WorkspaceSliceResult>;
    count(path: string, opts?: { depth?: number }): Promise<WorkspaceCountResult>;
  };
}

const SESSION_ROLES: readonly string[] = ['system', 'user', 'assistant', 'tool'];

/** A compacted segment nests its own archived vector; this bounds the walk. */
const MAX_COMPACTION_DEPTH = 32;

/**
 * Append one frame's conversation entries to `out`, expanding any compacted
 * segment into the turns it archived.
 *
 * An entry is a turn or an archived segment (AGENT_CONTEXT.md §1.1). Anything
 * else — a shape from a newer venue, a partially written record — is skipped
 * rather than surfaced as a turn with no role, so a transcript never renders a
 * blank message.
 */
function collectTurns(entries: unknown[], out: AgentSessionMessage[], depth = 0): void {
  if (depth > MAX_COMPACTION_DEPTH) return;
  for (const entry of entries) {
    const e = record(entry);
    if (!e) continue;
    if (Array.isArray(e.items) && typeof e.summary === 'string') {
      collectTurns(e.items, out, depth + 1);
      continue;
    }
    if (typeof e.role === 'string' && SESSION_ROLES.includes(e.role)) {
      out.push({ ...e, role: e.role } as AgentSessionMessage);
    }
  }
}

/** The session transcript: every frame's turns in order, compaction expanded. */
function sessionConversation(frames: unknown[]): AgentSessionMessage[] {
  const turns: AgentSessionMessage[] = [];
  for (const frame of frames) {
    const entries = record(frame)?.conversation;
    if (Array.isArray(entries)) collectTurns(entries, turns);
  }
  return turns;
}

function sessionRecord(sessionId: string, value: unknown): AgentSession {
  const session = record(value) ?? {};
  const meta: AgentSessionMetadata | undefined = record(session.meta);
  const frames = Array.isArray(session.frames) ? session.frames : [];
  return {
    id: sessionId,
    metadata: meta ?? {},
    pending: Array.isArray(session.pending) ? session.pending : [],
    frames,
    conversation: sessionConversation(frames),
    wakeTime: typeof session.wakeTime === 'number' ? session.wakeTime : undefined,
  };
}

export class AgentManager {
  // Whether this venue serves GET /api/v1/agents — flipped on the first 404 so
  // pre-0.4 venues pay the probe once, not one failed GET per read (covia#180).
  private agentsGetSupported = true;

  // Whether this venue serves GET /api/v1/agents/{id}/sse — flipped on a
  // route-missing 404 (covia#394 landed in venue 0.9.7). No version fast-path:
  // versionAtLeast() only resolves major.minor, not the patch precision this
  // needs, so rely purely on the lazy 404 latch (matches UserManager.usersGet).
  private agentSseSupported = true;

  constructor(private venue: AgentManagerVenue) {}

  /** Whether the venue serves `GET /api/v1/agents`: no if a probe already
   *  404'd. No version fast-path — a venue's self-reported version is weaker
   *  evidence than its answer to the request (an embedded venue can report
   *  its host application's version instead of its own; see covia-sdk#36).
   *  Rely purely on the lazy 404 latch, same as UserManager.usersGet. */
  private supportsAgentsGet(): boolean {
    return this.agentsGetSupported;
  }

  /** A job-free agents GET that rejects when the endpoint is unavailable. */
  private async agentsGet<T>(
    path: string,
    params: Record<string, string | boolean | undefined>,
  ): Promise<T> {
    if (this.supportsAgentsGet()) {
      try {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
        const q = qs.toString();
        return await venueJson<T>(
          this.venue,
          `/api/v1/agents${path}${q ? `?${q}` : ''}`,
        );
      } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
        // Not every 404 means "route missing". GET /agents/{id} 404s for a
        // missing AGENT too ("Agent not found: …"), and latching on that
        // permanently downgraded every later list/info to the job-minting
        // invoke path — one transient bad agent id turned a polling UI into
        // ~1k persisted jobs/hour. Only the bare list route (no per-resource
        // 404 possible) or the distinctive unmapped-endpoint body proves the
        // route is absent; a per-resource 404 propagates to the caller.
        const routeMissing = path === '' || ROUTE_MISSING_404.test(e.message);
        if (!routeMissing) throw e;
        this.agentsGetSupported = false;
      }
    }
    throw new UnsupportedVenueFeatureError('agent reads');
  }

  async create(input: AgentCreateInput): Promise<AgentCreateResult> {
    return this.venue.operations.run<AgentCreateResult>('v/ops/agent/create', input);
  }

  async request(agentId: string, input?: unknown, wait?: boolean | number): Promise<AgentRequestResult> {
    return this.venue.operations.run<AgentRequestResult>('v/ops/agent/request', { agentId, input, wait });
  }

  async message(agentId: string, message: unknown): Promise<AgentMessageResult> {
    return this.venue.operations.run<AgentMessageResult>('v/ops/agent/message', { agentId, message });
  }

  /**
   * Send a message to an agent and synchronously await its next response on the session.
   *
   * Session lifecycle:
   * - Omit `sessionId` on the first call — the server mints a new session and returns
   *   its id in the result. Capture it.
   * - Pass the returned `sessionId` on every subsequent call to continue the conversation.
   * - An unknown `sessionId` is rejected (the server will not silently mint one); omit
   *   the field entirely to start a new session.
   *
   * Concurrency: only one chat may be in flight per session. Concurrent calls on the
   * same session are rejected by the venue.
   *
   * Blocking: always blocks until the agent produces its next response on the session.
   * No polling required.
   */
  async chat(agentId: string, message: unknown, sessionId?: string): Promise<AgentChatResult> {
    return this.venue.operations.run<AgentChatResult>('v/ops/agent/chat', { agentId, message, sessionId });
  }

  /**
   * Set (or clear, by omitting `title` / passing an empty string) a
   * session's free-form human-facing title — persisted on the venue in
   * the session's own metadata, visible to every client and party in the
   * session (not a per-browser local override).
   */
  async renameSession(agentId: string, sessionId: string, title?: string): Promise<AgentRenameSessionResult> {
    return this.venue.operations.run<AgentRenameSessionResult>('v/ops/agent/rename-session', { agentId, sessionId, title });
  }

  async trigger(agentId: string): Promise<AgentTriggerResult> {
    return this.venue.operations.run<AgentTriggerResult>('v/ops/agent/trigger', { agentId });
  }

  /**
   * List the caller's agents. **Job-free** on covia ≥ 0.4: goes through
   * `GET /api/v1/agents` (covia#180) — synchronous, no Job persisted. Older
   * venues reject rather than silently creating a persisted Job.
   */
  async list(includeTerminated?: boolean): Promise<AgentListResult> {
    const result = await this.agentsGet<AgentListResult>('', { includeTerminated });
    // GET /api/v1/agents returns bare id strings; the agent:list op returns
    // {agentId, status, tasks} objects. Normalise to objects so consumers see
    // one shape regardless of which transport served the call.
    const raw = (result?.agents ?? []) as Array<string | AgentListResult['agents'][number]>;
    const agents = raw.map((a) => (typeof a === 'string' ? { agentId: a } : a));
    return { agents };
  }

  async delete(agentId: string, remove?: boolean): Promise<AgentDeleteResult> {
    return this.venue.operations.run<AgentDeleteResult>('v/ops/agent/delete', { agentId, remove });
  }

  async suspend(agentId: string): Promise<AgentSuspendResult> {
    return this.venue.operations.run<AgentSuspendResult>('v/ops/agent/suspend', { agentId });
  }

  async resume(agentId: string, autoWake?: boolean): Promise<AgentSuspendResult> {
    return this.venue.operations.run<AgentSuspendResult>('v/ops/agent/resume', { agentId, autoWake });
  }

  async update(input: AgentUpdateInput): Promise<unknown> {
    return this.venue.operations.run('v/ops/agent/update', input);
  }

  async cancelTask(agentId: string, taskId: string): Promise<unknown> {
    return this.venue.operations.run('v/ops/agent/cancel-task', { agentId, taskId });
  }

  /** Agent info. **Job-free** on covia ≥ 0.4 (`GET /api/v1/agents/{id}`,
   *  covia#180); older venues require an explicit compatibility opt-in. */
  async info(agentId: string): Promise<AgentInfoResult> {
    return this.agentsGet<AgentInfoResult>(`/${encodeURIComponent(agentId)}`, {});
  }

  /**
   * Stream this agent's run-loop events (run/cycle boundaries, inferences,
   * tool calls, status changes) from the venue's live tap (covia#394,
   * venue ≥ 0.9.7). Narrow to one session with `sessionId`; omit owner-only
   * tool input/result and appended-turn detail with `detail: false`. Pass
   * `signal` to abort — reader cancellation on abort or early exit is
   * handled by `parseSSEStream` (covia-sdk#30).
   * @throws {UnsupportedVenueFeatureError} on venues before 0.9.7.
   */
  async *events(
    agentId: string,
    options: { sessionId?: string; detail?: boolean; signal?: AbortSignal } = {},
  ): AsyncGenerator<AgentEvent> {
    if (!this.agentSseSupported) throw new UnsupportedVenueFeatureError('agent event stream');

    const qs = new URLSearchParams();
    if (options.sessionId !== undefined) qs.set('sessionId', options.sessionId);
    if (options.detail !== undefined) qs.set('detail', String(options.detail));
    const q = qs.toString();

    let response: Response;
    try {
      response = await venueStream(
        this.venue,
        `/api/v1/agents/${encodeURIComponent(agentId)}/sse${q ? `?${q}` : ''}`,
        { headers: { 'Accept': 'text/event-stream' }, signal: options.signal },
      );
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
      // Every call here targets one specific agent id — there is no bare
      // "list" route, so any 404 that isn't the distinctive unmapped-route
      // body is a genuine "Agent not found" and must propagate untouched,
      // never latch (see agentsGet / covia#180 for why a per-resource 404
      // must not be mistaken for a missing route).
      if (!ROUTE_MISSING_404.test(e.message)) throw e;
      this.agentSseSupported = false;
      throw new UnsupportedVenueFeatureError('agent event stream');
    }

    for await (const evt of parseSSEStream(response, { signal: options.signal })) {
      yield evt.json() as AgentEvent;
    }
  }

  /**
   * Page an agent's sessions directly from `g/<agentId>/sessions`.
   * This is a job-free Values read; session adapter-specific fields remain
   * available on each record's `value` while common runtime fields are typed.
   */
  async listSessions(agentId: string, options: AgentSessionListOptions = {}): Promise<AgentSessionPage> {
    const path = `g/${agentId}/sessions`;
    // Ascending is the index's own order and stays the default: this method
    // predates `order`, and silently re-ordering an existing caller's pages
    // would be a worse surprise than an explicit opt-in.
    if ((options.order ?? 'asc') === 'asc') {
      return this._sessionPage(path, await this.venue.workspace.slice(
        path, options.offset, options.limit,
      ), options.offset ?? 0, options.limit);
    }

    // Newest-first counts back from the end, so the window needs the total
    // first; the slice's own count is authoritative and re-places it once if
    // sessions were minted in between.
    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit;
    const guess = (await this.venue.workspace.count(path)).count ?? 0;
    if (limit === 0) return { items: [], total: guess, offset, limit: 0 };

    const read = async (total: number) => {
      const [start, end] = descWindow(total, offset, limit ?? total);
      return end > start
        ? this.venue.workspace.slice(path, start, end - start)
        : { exists: true, values: [], count: total, offset: start } as WorkspaceSliceResult;
    };
    let result = await read(guess);
    const total = result.count ?? guess;
    if (total !== guess) result = await read(total);

    const page = this._sessionPage(path, result, offset, limit);
    page.items.reverse();
    return page;
  }

  /** Shape a `{key, value}` session slice into a page. */
  private _sessionPage(
    _path: string, result: WorkspaceSliceResult, offset: number, limit?: number,
  ): AgentSessionPage {
    const sessions = (result.values ?? []).flatMap((entry) => {
      const pair = record(entry);
      if (!pair || typeof pair.key !== 'string') return [];
      return [sessionRecord(pair.key, pair.value)];
    });
    return {
      items: sessions,
      total: result.count ?? sessions.length,
      offset,
      limit: limit ?? sessions.length,
    };
  }

  /** Read one agent session directly from the workspace Values surface. */
  async getSession(agentId: string, sessionId: string): Promise<AgentSession> {
    const path = `g/${agentId}/sessions/${sessionId}`;
    const result = await this.venue.workspace.read(path);
    if (!result.exists) {
      throw new AgentSessionNotFoundError(agentId, sessionId);
    }
    // A session over the venue's single-read cap answers {exists:true,
    // truncated:true} with `value` withheld — it is present, not missing.
    // Assemble it from per-field reads (frames/pending are the growing parts).
    if (result.truncated) {
      return this._readLargeSession(path, sessionId);
    }
    if (result.value === undefined || result.value === null) {
      throw new AgentSessionNotFoundError(agentId, sessionId);
    }
    return sessionRecord(sessionId, result.value);
  }

  private async _readLargeSession(path: string, sessionId: string): Promise<AgentSession> {
    const [meta, wakeTime, pending, frames] = await Promise.all([
      this.venue.workspace.read(`${path}/meta`),
      this.venue.workspace.read(`${path}/wakeTime`),
      sliceAll(this.venue.workspace, `${path}/pending`),
      sliceAll(this.venue.workspace, `${path}/frames`),
    ]);
    return sessionRecord(sessionId, {
      meta: meta.exists ? (meta.value as unknown) : undefined,
      wakeTime: wakeTime.exists ? (wakeTime.value as unknown) : undefined,
      pending,
      frames,
    });
  }

  async fork(input: AgentForkInput): Promise<AgentForkResult> {
    return this.venue.operations.run<AgentForkResult>('v/ops/agent/fork', input);
  }

  async context(agentId: string, task?: unknown): Promise<string> {
    return this.venue.operations.run<string>('v/ops/agent/context', { agentId, task });
  }

  async completeTask(result?: unknown): Promise<AgentCompleteTaskResult> {
    return this.venue.operations.run<AgentCompleteTaskResult>('v/ops/agent/complete-task', { result });
  }

  async failTask(error: string): Promise<AgentFailTaskResult> {
    return this.venue.operations.run<AgentFailTaskResult>('v/ops/agent/fail-task', { error });
  }
}
