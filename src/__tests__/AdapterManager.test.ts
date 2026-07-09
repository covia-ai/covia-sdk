import { AdapterManager } from '../AdapterManager';

// AdapterManager is a thin projection over the workspace manager's job-free
// reads of v/info/adapters — so the workspace surface is mocked, and the
// transport concerns (values GET vs invoke fallback, auth) are covered by
// WorkspaceManager's own tests.
function createMockVenue() {
  return {
    workspace: {
      slice: jest.fn(),
      read: jest.fn(),
    },
  };
}

describe('AdapterManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let adapters: AdapterManager;

  beforeEach(() => {
    venue = createMockVenue();
    adapters = new AdapterManager(venue);
  });

  it('list slices v/info/adapters and unwraps map entries', async () => {
    venue.workspace.slice.mockResolvedValue({
      exists: true,
      type: 'Map',
      count: 2,
      values: [
        { key: 'covia', value: { name: 'covia', description: 'Lattice access', operations: ['v/ops/covia/read'] } },
        { key: 'test', value: { name: 'test', description: 'Testing', operations: ['v/test/ops/echo'] } },
      ],
    });
    const r = await adapters.list();
    expect(venue.workspace.slice).toHaveBeenCalledWith('v/info/adapters', 0, 1000);
    expect(r).toHaveLength(2);
    expect(r[0].name).toBe('covia');
    expect(r[0].operations).toEqual(['v/ops/covia/read']);
    expect(r[1].name).toBe('test');
  });

  it('list returns [] when the venue has no adapter info', async () => {
    venue.workspace.slice.mockResolvedValue({ exists: false });
    expect(await adapters.list()).toEqual([]);
  });

  it('list includes adapters with zero operations', async () => {
    venue.workspace.slice.mockResolvedValue({
      exists: true,
      values: [{ key: 'idle', value: { name: 'idle', description: 'No catalog ops', operations: [] } }],
    });
    const r = await adapters.list();
    expect(r).toEqual([{ name: 'idle', description: 'No catalog ops', operations: [] }]);
  });

  it('get reads v/info/adapters/<name>', async () => {
    venue.workspace.read.mockResolvedValue({
      exists: true,
      value: { name: 'covia', description: 'Lattice access', operations: ['v/ops/covia/read'] },
    });
    const r = await adapters.get('covia');
    expect(venue.workspace.read).toHaveBeenCalledWith('v/info/adapters/covia');
    expect(r?.name).toBe('covia');
  });

  it('get returns null for an unregistered adapter', async () => {
    venue.workspace.read.mockResolvedValue({ exists: false });
    expect(await adapters.get('nope')).toBeNull();
  });

  it('get URL-encodes the adapter name', async () => {
    venue.workspace.read.mockResolvedValue({ exists: false });
    await adapters.get('weird/name');
    expect(venue.workspace.read).toHaveBeenCalledWith('v/info/adapters/weird%2Fname');
  });
});
