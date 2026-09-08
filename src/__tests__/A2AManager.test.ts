import { A2AManager } from '../A2AManager';

function createMockVenue() {
  return {
    operations: {
      run: jest.fn().mockResolvedValue({ path: 'w/a2a/agents/bot', a2aAgentAsset: 'abc123', stored: true, id: 'did:key:zVenue/a/abc123' }),
      invoke: jest.fn().mockResolvedValue({ id: 'job-1' }),
    },
  };
}

describe('A2AManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let a2a: A2AManager;

  beforeEach(() => {
    venue = createMockVenue();
    a2a = new A2AManager(venue);
  });

  describe('importAgent', () => {
    it('runs v/ops/a2a/import-agent and waits for the typed result', async () => {
      const result = await a2a.importAgent({ name: 'venue-b-bot', url: 'https://remote.example/a2a' });
      expect(venue.operations.run).toHaveBeenCalledWith('v/ops/a2a/import-agent', {
        name: 'venue-b-bot', url: 'https://remote.example/a2a',
      });
      expect(result).toEqual({ path: 'w/a2a/agents/bot', a2aAgentAsset: 'abc123', stored: true, id: 'did:key:zVenue/a/abc123' });
    });

    it('passes coviaAgent + venue + auth through unchanged', async () => {
      await a2a.importAgent({
        name: 'twin', coviaAgent: 'g/a1', venue: 'https://venue-b.example',
        auth: { kind: 'bearer', secret: 's/TOKEN' },
      });
      expect(venue.operations.run).toHaveBeenCalledWith('v/ops/a2a/import-agent', {
        name: 'twin', coviaAgent: 'g/a1', venue: 'https://venue-b.example',
        auth: { kind: 'bearer', secret: 's/TOKEN' },
      });
    });
  });

  describe('send', () => {
    it('invokes v/ops/a2a/send and returns the raw Job — no waiting', async () => {
      const message = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const job = await a2a.send('w/a2a/agents/bot', message);
      expect(venue.operations.invoke).toHaveBeenCalledWith('v/ops/a2a/send', {
        agent: 'w/a2a/agents/bot', message,
      });
      expect(job).toEqual({ id: 'job-1' });
    });

    it('includes taskId only when continuing an existing remote Task', async () => {
      const message = { role: 'user', parts: [{ type: 'text', text: 'continue' }] };
      await a2a.send('w/a2a/agents/bot', message, { taskId: 'remote-task-9' });
      expect(venue.operations.invoke).toHaveBeenCalledWith('v/ops/a2a/send', {
        agent: 'w/a2a/agents/bot', message, taskId: 'remote-task-9',
      });
    });
  });
});
