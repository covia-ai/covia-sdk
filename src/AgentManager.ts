import { AgentCreateInput, AgentCreateResult, AgentRequestResult, AgentMessageResult, AgentChatResult, AgentTriggerResult, AgentListResult, AgentDeleteResult, AgentSuspendResult, AgentUpdateInput, AgentInfoResult, AgentForkInput, AgentForkResult, AgentCompleteTaskResult, AgentFailTaskResult, AgentRenameSessionResult, AgentSessionListOptions, AgentSessionListResult, AgentSessionMetadata, AgentSessionRecord, OperationRunner, NotFoundError, StatusData, WorkspaceReadResult, WorkspaceSliceResult } from './types';
import { fetchWithError } from './Utils';

interface AgentManagerVenue {
  baseUrl: string;
  venueId: string;
  auth: { apply(headers: Record<string, string>, audience?: string): void };
  operations: OperationRunner;
  workspace: {
    read(path: string, maxSize?: number): Promise<WorkspaceReadResult>;
    slice(path: string, offset?: number, limit?: number): Promise<WorkspaceSliceResult>;
  };
  lastKnownStatus?: StatusData;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function sessionRecord(sessionId: string, value: unknown): AgentSessionRecord {
  const session = record(value) ?? {};
  const meta: AgentSessionMetadata | undefined = record(session.meta);
  return {
    sessionId,
    meta: meta ?? {},
    pending: Array.isArray(session.pending) ? session.pending : [],
    frames: Array.isArray(session.frames) ? session.frames : [],
    wakeTime: typeof session.wakeTime === 'number' ? session.wakeTime : undefined,
    value: session,
  };
}

/** Whether a venue version string is at least `major.minor`. Unparseable → true
 *  (optimistic — the 404 probe corrects a wrong yes; a wrong no never recovers). */
function versionAtLeast(version: string | undefined, major: number, minor: number): boolean {
  const m = version?.match(/^(\d+)\.(\d+)/);
  if (!m) return true;
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj > major || (maj === major && min >= minor);
}

export class AgentManager {
  // Whether this venue serves GET /api/v1/agents — flipped on the first 404 so
  // pre-0.4 venues pay the probe once, not one failed GET per read (covia#180).
  private agentsGetSupported = true;

  constructor(private venue: AgentManagerVenue) {}

  private _headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    this.venue.auth.apply(headers, this.venue.venueId);
    return headers;
  }

  /** Whether the venue serves `GET /api/v1/agents`: no if a probe already
   *  404'd, or if the venue's last known status identifies it as pre-0.4. */
  private supportsAgentsGet(): boolean {
    if (!this.agentsGetSupported) return false;
    const status = this.venue.lastKnownStatus;
    if (status && (!status.version || !versionAtLeast(status.version, 0, 4))) {
      this.agentsGetSupported = false;
    }
    return this.agentsGetSupported;
  }

  /** A job-free agents GET, falling back to the invoke path on pre-0.4 venues. */
  private async _agentsOr<T>(
    path: string,
    params: Record<string, string | boolean | undefined>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    if (this.supportsAgentsGet()) {
      try {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
        const q = qs.toString();
        return await fetchWithError<T>(
          `${this.venue.baseUrl}/api/v1/agents${path}${q ? `?${q}` : ''}`,
          { headers: this._headers() });
      } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
        // Not every 404 means "route missing". GET /agents/{id} 404s for a
        // missing AGENT too ("Agent not found: …"), and latching on that
        // permanently downgraded every later list/info to the job-minting
        // invoke path — one transient bad agent id turned a polling UI into
        // ~1k persisted jobs/hour. Only the bare list route (no per-resource
        // 404 possible) or the distinctive unmapped-endpoint body proves the
        // route is absent; a per-resource 404 propagates to the caller.
        const routeMissing = path === '' || /\bEndpoint (GET|POST|PUT|DELETE|PATCH|HEAD) /.test(e.message);
        if (!routeMissing) throw e;
        this.agentsGetSupported = false;
      }
    }
    return fallback();
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
   * venues transparently fall back to the invoke path (one probe, remembered).
   */
  async list(includeTerminated?: boolean): Promise<AgentListResult> {
    const result = await this._agentsOr<AgentListResult>('', { includeTerminated }, () =>
      this.venue.operations.run<AgentListResult>('v/ops/agent/list', { includeTerminated }));
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
   *  covia#180); older venues fall back to the invoke path. */
  async info(agentId: string): Promise<AgentInfoResult> {
    return this._agentsOr<AgentInfoResult>(`/${encodeURIComponent(agentId)}`, {}, () =>
      this.venue.operations.run<AgentInfoResult>('v/ops/agent/info', { agentId }));
  }

  /**
   * Page an agent's sessions directly from `g/<agentId>/sessions`.
   * This is a job-free Values read; session adapter-specific fields remain
   * available on each record's `value` while common runtime fields are typed.
   */
  async listSessions(agentId: string, options: AgentSessionListOptions = {}): Promise<AgentSessionListResult> {
    const result = await this.venue.workspace.slice(
      `g/${agentId}/sessions`, options.offset, options.limit,
    );
    const sessions = (result.values ?? []).flatMap((entry) => {
      const pair = record(entry);
      if (!pair || typeof pair.key !== 'string') return [];
      return [sessionRecord(pair.key, pair.value)];
    });
    return {
      sessions,
      count: result.count ?? sessions.length,
      offset: result.offset ?? options.offset ?? 0,
    };
  }

  /** Read one agent session directly from the workspace Values surface. */
  async sessionInfo(agentId: string, sessionId: string): Promise<AgentSessionRecord | null> {
    const result = await this.venue.workspace.read(`g/${agentId}/sessions/${sessionId}`);
    if (!result.exists || result.value === undefined || result.value === null) return null;
    return sessionRecord(sessionId, result.value);
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
