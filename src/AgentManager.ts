import { AgentCreateInput, AgentCreateResult, AgentRequestResult, AgentMessageResult, AgentChatResult, AgentTriggerResult, AgentQueryResult, AgentListResult, AgentDeleteResult, AgentSuspendResult, AgentUpdateInput, AgentInfoResult, AgentForkInput, AgentForkResult, AgentCompleteTaskResult, AgentFailTaskResult, OperationRunner } from './types';

interface AgentManagerVenue {
  operations: OperationRunner;
}

export class AgentManager {
  constructor(private venue: AgentManagerVenue) {}

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

  async trigger(agentId: string): Promise<AgentTriggerResult> {
    return this.venue.operations.run<AgentTriggerResult>('v/ops/agent/trigger', { agentId });
  }

  async query(agentId: string): Promise<AgentQueryResult> {
    const read = (path: string) =>
      this.venue.operations.run<{ value: unknown }>('v/ops/covia/read', { path }).catch(() => ({ value: null }));
    const [info, timelineRes, stateRes, inboxRes] = await Promise.all([
      this.venue.operations.run<AgentQueryResult>('v/ops/agent/info', { agentId }),
      read(`g/${agentId}/timeline`),
      read(`g/${agentId}/state`),
      read(`g/${agentId}/inbox`),
    ]);
    return {
      ...info,
      timeline: Array.isArray(timelineRes.value) ? timelineRes.value : [],
      state: (stateRes.value ?? {}) as Record<string, unknown>,
      inbox: Array.isArray(inboxRes.value) ? inboxRes.value : [],
    };
  }

  async list(includeTerminated?: boolean): Promise<AgentListResult> {
    return this.venue.operations.run<AgentListResult>('v/ops/agent/list', { includeTerminated });
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

  async info(agentId: string): Promise<AgentInfoResult> {
    return this.venue.operations.run<AgentInfoResult>('v/ops/agent/info', { agentId });
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
