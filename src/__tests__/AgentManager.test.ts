import { AgentManager } from '../AgentManager';

function createMockVenue() {
  return {
    operations: { run: jest.fn().mockResolvedValue({}) },
  };
}

describe('AgentManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let agents: AgentManager;

  beforeEach(() => {
    venue = createMockVenue();
    agents = new AgentManager(venue as any);
  });

  it('create calls agent:create', async () => {
    await agents.create({ agentId: 'a1', config: { op: 'test:echo' } });
    expect(venue.operations.run).toHaveBeenCalledWith('agent:create', { agentId: 'a1', config: { op: 'test:echo' } });
  });

  it('request calls agent:request', async () => {
    await agents.request('a1', { prompt: 'hi' }, true);
    expect(venue.operations.run).toHaveBeenCalledWith('agent:request', { agentId: 'a1', input: { prompt: 'hi' }, wait: true });
  });

  it('message calls agent:message', async () => {
    await agents.message('a1', { text: 'hello' });
    expect(venue.operations.run).toHaveBeenCalledWith('agent:message', { agentId: 'a1', message: { text: 'hello' } });
  });

  it('trigger calls agent:trigger', async () => {
    await agents.trigger('a1');
    expect(venue.operations.run).toHaveBeenCalledWith('agent:trigger', { agentId: 'a1' });
  });

  it('query calls agent:query', async () => {
    await agents.query('a1');
    expect(venue.operations.run).toHaveBeenCalledWith('agent:query', { agentId: 'a1' });
  });

  it('list calls agent:list', async () => {
    await agents.list(true);
    expect(venue.operations.run).toHaveBeenCalledWith('agent:list', { includeTerminated: true });
  });

  it('list defaults includeTerminated to undefined', async () => {
    await agents.list();
    expect(venue.operations.run).toHaveBeenCalledWith('agent:list', { includeTerminated: undefined });
  });

  it('delete calls agent:delete', async () => {
    await agents.delete('a1', true);
    expect(venue.operations.run).toHaveBeenCalledWith('agent:delete', { agentId: 'a1', remove: true });
  });

  it('suspend calls agent:suspend', async () => {
    await agents.suspend('a1');
    expect(venue.operations.run).toHaveBeenCalledWith('agent:suspend', { agentId: 'a1' });
  });

  it('resume calls agent:resume', async () => {
    await agents.resume('a1', false);
    expect(venue.operations.run).toHaveBeenCalledWith('agent:resume', { agentId: 'a1', autoWake: false });
  });

  it('update calls agent:update', async () => {
    await agents.update({ agentId: 'a1', state: { counter: 5 } });
    expect(venue.operations.run).toHaveBeenCalledWith('agent:update', { agentId: 'a1', state: { counter: 5 } });
  });

  it('cancelTask calls agent:cancelTask', async () => {
    await agents.cancelTask('a1', 'task-42');
    expect(venue.operations.run).toHaveBeenCalledWith('agent:cancelTask', { agentId: 'a1', taskId: 'task-42' });
  });
});
