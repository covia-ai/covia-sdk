import { WorkspaceManager } from '../WorkspaceManager';

function createMockVenue() {
  return {
    operations: { run: jest.fn().mockResolvedValue({}) },
  };
}

describe('WorkspaceManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let ws: WorkspaceManager;

  beforeEach(() => {
    venue = createMockVenue();
    ws = new WorkspaceManager(venue as any);
  });

  it('read calls v/ops/covia/read', async () => {
    await ws.read('w/mydata', 500);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/read', { path: 'w/mydata', maxSize: 500 }, { ucans: undefined });
  });

  it('write calls v/ops/covia/write', async () => {
    await ws.write('w/mydata', { key: 'value' });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/write', { path: 'w/mydata', value: { key: 'value' } }, { ucans: undefined });
  });

  it('delete calls v/ops/covia/delete', async () => {
    await ws.delete('w/mydata');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/delete', { path: 'w/mydata' }, { ucans: undefined });
  });

  it('append calls v/ops/covia/append', async () => {
    await ws.append('w/mylist', 'item');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/append', { path: 'w/mylist', value: 'item' }, { ucans: undefined });
  });

  it('list calls v/ops/covia/list', async () => {
    await ws.list('w/', 10, 0);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/list', { path: 'w/', limit: 10, offset: 0 }, { ucans: undefined });
  });

  it('slice calls v/ops/covia/slice', async () => {
    await ws.slice('w/mylist', 5, 10);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/slice', { path: 'w/mylist', offset: 5, limit: 10 }, { ucans: undefined });
  });

  it('copy calls v/ops/covia/copy', async () => {
    await ws.copy('v/ops/json/merge', 'o/merge');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/copy', { from: 'v/ops/json/merge', to: 'o/merge' }, { ucans: undefined });
  });

  it('inspect calls v/ops/covia/inspect with single path', async () => {
    await ws.inspect('v/ops', 400);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/inspect', { paths: 'v/ops', budget: 400, compact: undefined }, { ucans: undefined });
  });

  it('inspect calls v/ops/covia/inspect with multiple paths', async () => {
    await ws.inspect(['v/ops/json/merge', 'w/mydata'], 2000, false);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/inspect', { paths: ['v/ops/json/merge', 'w/mydata'], budget: 2000, compact: false }, { ucans: undefined });
  });

  it('forwards ucans (capability proof) for cross-DID reads', async () => {
    await ws.read('did:key:zAlice/w/shared', undefined, ['eyJ.proof']);
    expect(venue.operations.run).toHaveBeenCalledWith(
      'v/ops/covia/read',
      { path: 'did:key:zAlice/w/shared', maxSize: undefined },
      { ucans: ['eyJ.proof'] },
    );
  });
});
