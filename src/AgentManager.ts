import { AgentCreateInput, AgentCreateResult, AgentRequestResult, AgentMessageResult, AgentTriggerResult, AgentQueryResult, AgentListResult, AgentDeleteResult, AgentSuspendResult, AgentUpdateInput } from './types';

interface AgentManagerVenue {
  operations: { run(assetId: string, input: any): Promise<any> };
}

export class AgentManager {
  constructor(private venue: AgentManagerVenue) {}

  async create(input: AgentCreateInput): Promise<AgentCreateResult> {
    return this.venue.operations.run('v/ops/agent/create', input);
  }

  async request(agentId: string, input?: any, wait?: boolean | number): Promise<AgentRequestResult> {
    return this.venue.operations.run('v/ops/agent/request', { agentId, input, wait });
  }

  async message(agentId: string, message: any): Promise<AgentMessageResult> {
    return this.venue.operations.run('v/ops/agent/message', { agentId, message });
  }

  async trigger(agentId: string): Promise<AgentTriggerResult> {
    return this.venue.operations.run('v/ops/agent/trigger', { agentId });
  }

  async query(agentId: string): Promise<AgentQueryResult> {
    return this.venue.operations.run('v/ops/agent/info', { agentId });
  }

  async list(includeTerminated?: boolean): Promise<AgentListResult> {
    return this.venue.operations.run('v/ops/agent/list', { includeTerminated });
  }

  async delete(agentId: string, remove?: boolean): Promise<AgentDeleteResult> {
    return this.venue.operations.run('v/ops/agent/delete', { agentId, remove });
  }

  async suspend(agentId: string): Promise<AgentSuspendResult> {
    return this.venue.operations.run('v/ops/agent/suspend', { agentId });
  }

  async resume(agentId: string, autoWake?: boolean): Promise<AgentSuspendResult> {
    return this.venue.operations.run('v/ops/agent/resume', { agentId, autoWake });
  }

  async update(input: AgentUpdateInput): Promise<any> {
    return this.venue.operations.run('v/ops/agent/update', input);
  }

  async cancelTask(agentId: string, taskId: string): Promise<any> {
    return this.venue.operations.run('v/ops/agent/cancel-task', { agentId, taskId });
  }
}
