import { AgentManager } from '../AgentManager';

// list/info are job-free GETs to /api/v1/agents (covia #180); everything else
// stays on the invoke/job path. Fetch is mocked for the GET surface,
// operations.run for the rest (and the old-venue fallback).
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function createMockVenue() {
  return {
    baseUrl: 'https://venue.example',
    venueId: 'did:key:zVenue',
    auth: { apply: jest.fn((h: Record<string, string>) => { h['Authorization'] = 'Bearer tok'; }) },
    operations: { run: jest.fn().mockResolvedValue({}) },
  };
}

function okJson(data: any) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

describe('AgentManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let agents: AgentManager;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = createMockVenue();
    agents = new AgentManager(venue);
  });

  it('create calls v/ops/agent/create', async () => {
    await agents.create({ agentId: 'a1', config: { op: 'test:echo' } });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/create', { agentId: 'a1', config: { op: 'test:echo' } });
  });

  it('request calls v/ops/agent/request', async () => {
    await agents.request('a1', { prompt: 'hi' }, true);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/request', { agentId: 'a1', input: { prompt: 'hi' }, wait: true });
  });

  it('message calls v/ops/agent/message', async () => {
    await agents.message('a1', { text: 'hello' });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/message', { agentId: 'a1', message: { text: 'hello' } });
  });

  it('chat calls v/ops/agent/chat without sessionId on first call', async () => {
    await agents.chat('a1', 'hello');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/chat', { agentId: 'a1', message: 'hello', sessionId: undefined });
  });

  it('chat passes sessionId when continuing a session', async () => {
    await agents.chat('a1', 'follow up', 'deadbeef');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/chat', { agentId: 'a1', message: 'follow up', sessionId: 'deadbeef' });
  });

  it('chat passes structured message payloads through unchanged', async () => {
    await agents.chat('a1', { kind: 'tool-result', data: [1, 2, 3] }, 'sid-1');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/chat', { agentId: 'a1', message: { kind: 'tool-result', data: [1, 2, 3] }, sessionId: 'sid-1' });
  });

  it('trigger calls v/ops/agent/trigger', async () => {
    await agents.trigger('a1');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/trigger', { agentId: 'a1' });
  });

  it('list GETs /api/v1/agents (no job) and binds auth', async () => {
    okJson({ agents: ['a1'] });
    const r = await agents.list(true) as any;
    expect(venue.operations.run).not.toHaveBeenCalled();            // NOT the job path
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/agents');
    expect(u.searchParams.get('includeTerminated')).toBe('true');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(r.agents).toEqual([{ agentId: 'a1' }]); // bare ids normalised to objects
  });

  it('list omits undefined params and falls back to the op path on 404', async () => {
    okJson({ agents: [] });
    await agents.list();
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.searchParams.get('includeTerminated')).toBeNull();

    // Old venue: the GET 404s once, the manager remembers, list falls back.
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404,
      json: () => Promise.resolve({ error: 'not found' }), text: () => Promise.resolve('not found') });
    await agents.list(true);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/list', { includeTerminated: true });
    // Subsequent calls skip the probe entirely.
    await agents.list();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/list', { includeTerminated: undefined });
  });

  it('list normalises the GET route\'s bare id strings to {agentId} objects', async () => {
    // GET /api/v1/agents returns ["a1", ...]; the invoke op returns enriched
    // objects. Consumers must always see objects.
    okJson({ agents: ['a1', 'a2'] });
    const result = await agents.list();
    expect(result.agents).toEqual([{ agentId: 'a1' }, { agentId: 'a2' }]);
  });

  it('list passes enriched object entries through unchanged', async () => {
    okJson({ agents: [{ agentId: 'a1', status: 'SLEEPING', tasks: 2 }] });
    const result = await agents.list();
    expect(result.agents).toEqual([{ agentId: 'a1', status: 'SLEEPING', tasks: 2 }]);
  });

  it('info on a MISSING AGENT propagates the 404 — no invoke fallback, no latch', async () => {
    // Regression: this 404 used to be read as "venue lacks the GET routes",
    // permanently downgrading every later list/info to the job-minting invoke
    // path (~1k persisted jobs/hour from a 3s polling UI).
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404,
      json: () => Promise.resolve({ error: 'Agent not found: ghost' }),
      text: () => Promise.resolve('Agent not found: ghost') });
    await expect(agents.info('ghost')).rejects.toThrow('Agent not found: ghost');
    expect(venue.operations.run).not.toHaveBeenCalled();

    // The GET surface stays trusted: the next list still goes job-free.
    okJson({ agents: [] });
    await agents.list();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('info on a pre-0.4 venue (unmapped endpoint 404) falls back to invoke and latches', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404,
      json: () => Promise.resolve({ error: 'Endpoint GET /api/v1/agents/a1 not found' }),
      text: () => Promise.resolve('Endpoint GET /api/v1/agents/a1 not found') });
    await agents.info('a1');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/info', { agentId: 'a1' });

    await agents.list();
    expect(mockFetch).toHaveBeenCalledTimes(1); // latched — no further GET probes
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/list', { includeTerminated: undefined });
  });

  it('delete calls v/ops/agent/delete', async () => {
    await agents.delete('a1', true);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/delete', { agentId: 'a1', remove: true });
  });

  it('suspend calls v/ops/agent/suspend', async () => {
    await agents.suspend('a1');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/suspend', { agentId: 'a1' });
  });

  it('resume calls v/ops/agent/resume', async () => {
    await agents.resume('a1', false);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/resume', { agentId: 'a1', autoWake: false });
  });

  it('update calls v/ops/agent/update', async () => {
    await agents.update({ agentId: 'a1', state: { counter: 5 } });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/update', { agentId: 'a1', state: { counter: 5 } });
  });

  it('cancelTask calls v/ops/agent/cancel-task', async () => {
    await agents.cancelTask('a1', 'task-42');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/cancel-task', { agentId: 'a1', taskId: 'task-42' });
  });

  it('info GETs /api/v1/agents/{id} (no job)', async () => {
    okJson({ agentId: 'a1', status: 'SLEEPING' });
    const r = await agents.info('a1') as any;
    expect(venue.operations.run).not.toHaveBeenCalled();
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/agents/a1');
    expect(r.agentId).toBe('a1');
  });

  it('info falls back to v/ops/agent/info on pre-0.4 venues', async () => {
    (venue as any).lastKnownStatus = { version: '0.3.0' };
    await agents.info('a1');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/info', { agentId: 'a1' });
  });

  it('fork calls v/ops/agent/fork', async () => {
    await agents.fork({ sourceId: 'a1', agentId: 'a2', includeTimeline: true });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/fork', { sourceId: 'a1', agentId: 'a2', includeTimeline: true });
  });

  it('context calls v/ops/agent/context', async () => {
    await agents.context('a1', { goal: 'test' });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/context', { agentId: 'a1', task: { goal: 'test' } });
  });

  it('context works without task', async () => {
    await agents.context('a1');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/context', { agentId: 'a1', task: undefined });
  });

  it('completeTask calls v/ops/agent/complete-task', async () => {
    await agents.completeTask({ answer: 42 });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/complete-task', { result: { answer: 42 } });
  });

  it('failTask calls v/ops/agent/fail-task', async () => {
    await agents.failTask('something went wrong');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/agent/fail-task', { error: 'something went wrong' });
  });
});
