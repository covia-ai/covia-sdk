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
    expect(result).toEqual([
      {
        number: 1,
        text: 'Likes concise answers',
        createdAt: 100,
        updatedAt: 200,
      },
      {
        number: 2,
        text: 'Uses TypeScript',
        createdAt: undefined,
        updatedAt: undefined,
      },
    ]);
  });

  it('treats an absent memory path as an empty list', async () => {
    const venue = createVenue(undefined, false);
    const memory = new MemoryManager(venue);
    await expect(memory.list('w/profile/memory')).resolves.toEqual([]);
  });

  it('keeps remember, update and forget on the audited operation path', async () => {
    const venue = createVenue([]);
    venue.operations.run
      .mockResolvedValueOnce({ remembered: true, n: 1, count: 1 })
      .mockResolvedValueOnce({ updated: true, n: 2, count: 2 })
      .mockResolvedValueOnce({ forgotten: true, n: 1, count: 1 });
    const memory = new MemoryManager(venue);

    await expect(memory.remember('Fact', 'w/custom')).resolves.toEqual({ number: 1, count: 1 });
    await expect(memory.update(2, 'Revised', 'w/custom')).resolves.toEqual({ number: 2, count: 2 });
    await expect(memory.forget(1, 'w/custom')).resolves.toEqual({ number: 1, count: 1 });

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

  it('rejects a list entry that has no text', async () => {
    const memory = new MemoryManager(createVenue([{ value: 42 }]));
    await expect(memory.list()).rejects.toThrow('Memory entry 1 at w/memory has no text');
  });

  it('rejects an invalid mutation response', async () => {
    const venue = createVenue([]);
    const memory = new MemoryManager(venue);
    await expect(memory.remember('Fact')).rejects.toThrow('invalid memory mutation result');
  });
});
