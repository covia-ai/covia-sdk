import { MemoryManager } from '../MemoryManager';

function createVenue(value: unknown = undefined, exists = true) {
  return {
    workspace: {
      read: jest.fn().mockResolvedValue({ exists, value }),
    },
    operations: {
      run: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('MemoryManager', () => {
  it('lists structured memory through a job-free workspace read', async () => {
    const venue = createVenue([
      { text: 'Likes concise answers', ts: 100, updated: 200 },
      'Uses TypeScript',
    ]);
    const memory = new MemoryManager(venue);

    const result = await memory.list();

    expect(venue.workspace.read).toHaveBeenCalledWith('w/memory');
    expect(venue.operations.run).not.toHaveBeenCalled();
    expect(result.entries).toEqual([
      {
        number: 1,
        value: { text: 'Likes concise answers', ts: 100, updated: 200 },
        text: 'Likes concise answers',
        createdAt: 100,
        updatedAt: 200,
      },
      {
        number: 2,
        value: 'Uses TypeScript',
        text: 'Uses TypeScript',
        createdAt: undefined,
        updatedAt: undefined,
      },
    ]);
  });

  it('treats an absent memory path as an empty list', async () => {
    const venue = createVenue(undefined, false);
    const memory = new MemoryManager(venue);
    await expect(memory.list('w/profile/memory')).resolves.toEqual({
      path: 'w/profile/memory', entries: [],
    });
  });

  it('keeps remember, update and forget on the audited operation path', async () => {
    const venue = createVenue([]);
    const memory = new MemoryManager(venue);

    await memory.remember('Fact', 'w/custom');
    await memory.update(2, 'Revised', 'w/custom');
    await memory.forget(1, 'w/custom');

    expect(venue.operations.run.mock.calls).toEqual([
      ['v/ops/memory', { command: 'remember', text: 'Fact', path: 'w/custom' }],
      ['v/ops/memory', { command: 'update', n: 2, text: 'Revised', path: 'w/custom' }],
      ['v/ops/memory', { command: 'forget', n: 1, path: 'w/custom' }],
    ]);
  });

  it('refuses to present a structured store as editable numbered memory', async () => {
    const memory = new MemoryManager(createVenue({ a: { text: 'Fact' } }));
    await expect(memory.list()).rejects.toThrow('Memory at w/memory is not a flat list');
  });
});
