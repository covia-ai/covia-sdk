import { Agent, ChatSession } from '../Agent';

function createMockAgents() {
  return {
    request: jest.fn().mockResolvedValue({ id: 'req-1', status: 'RUNNING' }),
    message: jest.fn().mockResolvedValue({ agentId: 'a1', delivered: true }),
    chat: jest.fn().mockResolvedValue({ agentId: 'a1', sessionId: 'sess-1', response: 'hello' }),
    trigger: jest.fn().mockResolvedValue({ agentId: 'a1', status: 'RUNNING' }),
    suspend: jest.fn().mockResolvedValue({ agentId: 'a1', status: 'SUSPENDED' }),
    resume: jest.fn().mockResolvedValue({ agentId: 'a1', status: 'SLEEPING' }),
    update: jest.fn().mockResolvedValue({}),
    cancelTask: jest.fn().mockResolvedValue({}),
    info: jest.fn().mockResolvedValue({ agentId: 'a1', status: 'SLEEPING' }),
    fork: jest.fn().mockResolvedValue({ agentId: 'a2', status: 'SLEEPING', created: true, forkedFrom: 'a1' }),
    context: jest.fn().mockResolvedValue('context string'),
    delete: jest.fn().mockResolvedValue({ agentId: 'a1', status: 'TERMINATED' }),
  };
}

function createMockVenue(agents = createMockAgents()) {
  return { agents } as any;
}

describe('Agent', () => {
  let mockAgents: ReturnType<typeof createMockAgents>;
  let venue: ReturnType<typeof createMockVenue>;
  let agent: Agent;

  beforeEach(() => {
    mockAgents = createMockAgents();
    venue = createMockVenue(mockAgents);
    agent = new Agent('a1', venue);
  });

  it('stores id and venue', () => {
    expect(agent.id).toBe('a1');
    expect(agent.venue).toBe(venue);
  });

  it('request delegates to agents.request', async () => {
    await agent.request({ prompt: 'hi' }, true);
    expect(mockAgents.request).toHaveBeenCalledWith('a1', { prompt: 'hi' }, true);
  });

  it('message delegates to agents.message', async () => {
    await agent.message({ text: 'hello' });
    expect(mockAgents.message).toHaveBeenCalledWith('a1', { text: 'hello' });
  });

  it('chat delegates to agents.chat', async () => {
    await agent.chat('hello');
    expect(mockAgents.chat).toHaveBeenCalledWith('a1', 'hello', undefined);
  });

  it('chat passes sessionId when provided', async () => {
    await agent.chat('follow up', 'sess-1');
    expect(mockAgents.chat).toHaveBeenCalledWith('a1', 'follow up', 'sess-1');
  });

  it('trigger delegates to agents.trigger', async () => {
    await agent.trigger();
    expect(mockAgents.trigger).toHaveBeenCalledWith('a1');
  });

  it('suspend delegates to agents.suspend', async () => {
    await agent.suspend();
    expect(mockAgents.suspend).toHaveBeenCalledWith('a1');
  });

  it('resume delegates to agents.resume', async () => {
    await agent.resume(false);
    expect(mockAgents.resume).toHaveBeenCalledWith('a1', false);
  });

  it('update delegates to agents.update with bound agentId', async () => {
    await agent.update({ config: { op: 'test' }, state: { x: 1 } });
    expect(mockAgents.update).toHaveBeenCalledWith({ agentId: 'a1', config: { op: 'test' }, state: { x: 1 } });
  });

  it('cancelTask delegates to agents.cancelTask', async () => {
    await agent.cancelTask('task-42');
    expect(mockAgents.cancelTask).toHaveBeenCalledWith('a1', 'task-42');
  });

  it('info delegates to agents.info', async () => {
    await agent.info();
    expect(mockAgents.info).toHaveBeenCalledWith('a1');
  });

  it('fork delegates to agents.fork and returns new Agent', async () => {
    const forked = await agent.fork('a2', { includeTimeline: true });
    expect(mockAgents.fork).toHaveBeenCalledWith({ sourceId: 'a1', agentId: 'a2', includeTimeline: true });
    expect(forked).toBeInstanceOf(Agent);
    expect(forked.id).toBe('a2');
    expect(forked.venue).toBe(venue);
  });

  it('context delegates to agents.context', async () => {
    await agent.context({ goal: 'test' });
    expect(mockAgents.context).toHaveBeenCalledWith('a1', { goal: 'test' });
  });

  it('context works without task', async () => {
    await agent.context();
    expect(mockAgents.context).toHaveBeenCalledWith('a1', undefined);
  });

  it('delete delegates to agents.delete', async () => {
    await agent.delete(true);
    expect(mockAgents.delete).toHaveBeenCalledWith('a1', true);
  });

  it('chatSession returns a ChatSession bound to this agent', () => {
    const session = agent.chatSession();
    expect(session).toBeInstanceOf(ChatSession);
    expect(session.agent).toBe(agent);
  });

  it('chatSession accepts an existing sessionId for resuming', () => {
    const session = agent.chatSession('existing-sid');
    expect(session.sessionId).toBe('existing-sid');
  });
});

describe('ChatSession', () => {
  let mockAgents: ReturnType<typeof createMockAgents>;
  let agent: Agent;

  beforeEach(() => {
    mockAgents = createMockAgents();
    const venue = createMockVenue(mockAgents);
    agent = new Agent('a1', venue);
  });

  it('sessionId is undefined before first send', () => {
    const session = new ChatSession(agent);
    expect(session.sessionId).toBeUndefined();
  });

  it('first send omits sessionId and captures it from result', async () => {
    const session = new ChatSession(agent);
    const result = await session.send('hi');
    expect(mockAgents.chat).toHaveBeenCalledWith('a1', 'hi', undefined);
    expect(session.sessionId).toBe('sess-1');
    expect(result.sessionId).toBe('sess-1');
  });

  it('subsequent sends pass the captured sessionId', async () => {
    const session = new ChatSession(agent);
    await session.send('hi');
    mockAgents.chat.mockResolvedValue({ agentId: 'a1', sessionId: 'sess-1', response: 'world' });
    await session.send('and?');
    expect(mockAgents.chat).toHaveBeenCalledWith('a1', 'and?', 'sess-1');
  });

  it('pre-loaded sessionId is used on first send', async () => {
    const session = new ChatSession(agent, 'existing-sid');
    expect(session.sessionId).toBe('existing-sid');
    await session.send('resume');
    expect(mockAgents.chat).toHaveBeenCalledWith('a1', 'resume', 'existing-sid');
  });

  it('returns full AgentChatResult', async () => {
    const session = new ChatSession(agent);
    const result = await session.send('hi');
    expect(result).toEqual({ agentId: 'a1', sessionId: 'sess-1', response: 'hello' });
  });
});
