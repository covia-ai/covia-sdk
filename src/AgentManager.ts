import { VenueInterface, AgentCreateInput, AgentCreateResult, AgentRequestResult, AgentMessageResult, AgentTriggerResult, AgentQueryResult, AgentListResult, AgentDeleteResult, AgentSuspendResult, AgentUpdateInput } from './types';

export class AgentManager {
  constructor(private venue: VenueInterface) {}

  async create(input: AgentCreateInput): Promise<AgentCreateResult> {
    return this.venue.run('agent:create', input);
  }

  async request(agentId: string, input?: any, wait?: boolean | number): Promise<AgentRequestResult> {
    return this.venue.run('agent:request', { agentId, input, wait });
  }

  async message(agentId: string, message: any): Promise<AgentMessageResult> {
    return this.venue.run('agent:message', { agentId, message });
  }

  async trigger(agentId: string): Promise<AgentTriggerResult> {
    return this.venue.run('agent:trigger', { agentId });
  }

  async query(agentId: string): Promise<AgentQueryResult> {
    return this.venue.run('agent:query', { agentId });
  }

  async list(includeTerminated?: boolean): Promise<AgentListResult> {
    return this.venue.run('agent:list', { includeTerminated });
  }

  async delete(agentId: string, remove?: boolean): Promise<AgentDeleteResult> {
    return this.venue.run('agent:delete', { agentId, remove });
  }

  async suspend(agentId: string): Promise<AgentSuspendResult> {
    return this.venue.run('agent:suspend', { agentId });
  }

  async resume(agentId: string, autoWake?: boolean): Promise<AgentSuspendResult> {
    return this.venue.run('agent:resume', { agentId, autoWake });
  }

  async update(input: AgentUpdateInput): Promise<any> {
    return this.venue.run('agent:update', input);
  }

  async cancelTask(agentId: string, taskId: string): Promise<any> {
    return this.venue.run('agent:cancelTask', { agentId, taskId });
  }
}
