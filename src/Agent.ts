import {
  AgentRequestResult,
  AgentMessageResult,
  AgentChatResult,
  AgentTriggerResult,
  AgentSuspendResult,
  AgentUpdateInput,
  AgentInfoResult,
  AgentForkInput,
  AgentForkResult,
  AgentDeleteResult,
  VenueInterface,
} from './types';

/** Minimal interface for the agent operations Agent needs from the venue's AgentManager. */
interface AgentOps {
  request(agentId: string, input?: any, wait?: boolean | number): Promise<AgentRequestResult>;
  message(agentId: string, message: any): Promise<AgentMessageResult>;
  chat(agentId: string, message: any, sessionId?: string): Promise<AgentChatResult>;
  trigger(agentId: string): Promise<AgentTriggerResult>;
  suspend(agentId: string): Promise<AgentSuspendResult>;
  resume(agentId: string, autoWake?: boolean): Promise<AgentSuspendResult>;
  update(input: AgentUpdateInput): Promise<any>;
  cancelTask(agentId: string, taskId: string): Promise<any>;
  info(agentId: string): Promise<AgentInfoResult>;
  fork(input: AgentForkInput): Promise<AgentForkResult>;
  context(agentId: string, task?: any): Promise<string>;
  delete(agentId: string, remove?: boolean): Promise<AgentDeleteResult>;
}

export class Agent {
  public readonly id: string;
  public readonly venue: VenueInterface;
  private _agents: AgentOps;

  constructor(id: string, venue: VenueInterface) {
    this.id = id;
    this.venue = venue;
    this._agents = (venue as unknown as { agents: AgentOps }).agents;
  }

  async request(input?: any, wait?: boolean | number): Promise<AgentRequestResult> {
    return this._agents.request(this.id, input, wait);
  }

  async message(message: any): Promise<AgentMessageResult> {
    return this._agents.message(this.id, message);
  }

  async chat(message: any, sessionId?: string): Promise<AgentChatResult> {
    return this._agents.chat(this.id, message, sessionId);
  }

  /**
   * Create a ChatSession bound to this agent.
   * @param sessionId - Optional session ID to resume an existing session
   */
  chatSession(sessionId?: string): ChatSession {
    return new ChatSession(this, sessionId);
  }

  async trigger(): Promise<AgentTriggerResult> {
    return this._agents.trigger(this.id);
  }

  async suspend(): Promise<AgentSuspendResult> {
    return this._agents.suspend(this.id);
  }

  async resume(autoWake?: boolean): Promise<AgentSuspendResult> {
    return this._agents.resume(this.id, autoWake);
  }

  async update(options: { config?: Record<string, any>; state?: Record<string, any> }): Promise<any> {
    return this._agents.update({ agentId: this.id, ...options });
  }

  async cancelTask(taskId: string): Promise<any> {
    return this._agents.cancelTask(this.id, taskId);
  }

  async info(): Promise<AgentInfoResult> {
    return this._agents.info(this.id);
  }

  /**
   * Fork this agent into a new agent.
   * @param agentId - ID for the new forked agent
   * @param options - Fork options
   * @returns A new Agent instance for the forked agent
   */
  async fork(agentId: string, options?: { config?: Record<string, any>; includeTimeline?: boolean; overwrite?: boolean }): Promise<Agent> {
    await this._agents.fork({ sourceId: this.id, agentId, ...options });
    return new Agent(agentId, this.venue);
  }

  async context(task?: any): Promise<string> {
    return this._agents.context(this.id, task);
  }

  async delete(remove?: boolean): Promise<AgentDeleteResult> {
    return this._agents.delete(this.id, remove);
  }
}

export class ChatSession {
  public readonly agent: Agent;
  private _sessionId: string | undefined;

  constructor(agent: Agent, sessionId?: string) {
    this.agent = agent;
    this._sessionId = sessionId;
  }

  /** The session ID, or undefined if no message has been sent yet and no ID was provided. */
  get sessionId(): string | undefined {
    return this._sessionId;
  }

  /**
   * Send a message on this session.
   * On the first call (when no sessionId is set), the server mints a new session.
   * The returned sessionId is captured and reused for all subsequent calls.
   */
  async send(message: any): Promise<AgentChatResult> {
    const result = await this.agent.chat(message, this._sessionId);
    this._sessionId = result.sessionId;
    return result;
  }
}
