import { A2AImportAgentInput, A2AImportAgentResult, A2AMessage, InvokeOptions } from './types';
import { Job } from './Job';

const IMPORT_AGENT_OP = 'v/ops/a2a/import-agent';
const SEND_OP = 'v/ops/a2a/send';

interface OpOps {
  run<T = unknown>(assetId: string, input?: unknown, options?: InvokeOptions): Promise<T>;
  invoke(assetId: string, input?: unknown, options?: InvokeOptions): Promise<Job>;
}

interface A2AManagerVenue {
  operations: OpOps;
}

/**
 * Bring-your-own-agent (A2A): import a remote A2A endpoint or another Covia
 * agent as an immutable agent Asset, then task it. Both calls persist a Job
 * (the venue records the import and mirrors the remote Task's lifecycle onto
 * `send`'s Job) — there is no job-free surface here.
 */
export class A2AManager {
  constructor(private venue: A2AManagerVenue) {}

  /**
   * Register a remote A2A endpoint or Covia agent as an immutable agent
   * Asset, with a mutable binding at `w/a2a/agents/<name>`. Waits for the
   * import to complete and returns its result directly.
   */
  async importAgent(input: A2AImportAgentInput): Promise<A2AImportAgentResult> {
    return this.venue.operations.run<A2AImportAgentResult>(IMPORT_AGENT_OP, input);
  }

  /**
   * Task an imported agent. Returns the raw Job rather than waiting for a
   * result: the local Job mirrors the remote Task's lifecycle, so a reply
   * that pauses (INPUT_REQUIRED, AUTH_REQUIRED) is a paused Job the caller
   * inspects and continues via `job.sendMessage()` — the same shape as any
   * other paused job, not a special case for A2A. Once the Job reaches a
   * terminal state, `job.output` is the final remote `A2ATask`.
   *
   * @param agent Imported agent reference — `w/a2a/agents/<name>` or its
   *   immutable `did:.../a/<hash>` id.
   * @param message An A2A Message: `{ role, parts, messageId? }`.
   * @param options.taskId Continue an existing remote Task instead of
   *   starting a new one.
   */
  async send(agent: string, message: A2AMessage, options?: { taskId?: string }): Promise<Job> {
    return this.venue.operations.invoke(SEND_OP, {
      agent,
      message,
      ...(options?.taskId !== undefined && { taskId: options.taskId }),
    });
  }
}
