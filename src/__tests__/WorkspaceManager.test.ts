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

  it('read calls covia:read', async () => {
    await ws.read('w/mydata', 500);
    expect(venue.operations.run).toHaveBeenCalledWith('covia:read', { path: 'w/mydata', maxSize: 500 });
  });

  it('write calls covia:write', async () => {
    await ws.write('w/mydata', { key: 'value' });
    expect(venue.operations.run).toHaveBeenCalledWith('covia:write', { path: 'w/mydata', value: { key: 'value' } });
  });

  it('delete calls covia:delete', async () => {
    await ws.delete('w/mydata');
    expect(venue.operations.run).toHaveBeenCalledWith('covia:delete', { path: 'w/mydata' });
  });

  it('append calls covia:append', async () => {
    await ws.append('w/mylist', 'item');
    expect(venue.operations.run).toHaveBeenCalledWith('covia:append', { path: 'w/mylist', value: 'item' });
  });

  it('list calls covia:list', async () => {
    await ws.list('w/', 10, 0);
    expect(venue.operations.run).toHaveBeenCalledWith('covia:list', { path: 'w/', limit: 10, offset: 0 });
  });

  it('slice calls covia:slice', async () => {
    await ws.slice('w/mylist', 5, 10);
    expect(venue.operations.run).toHaveBeenCalledWith('covia:slice', { path: 'w/mylist', offset: 5, limit: 10 });
  });

  it('functions calls covia:functions', async () => {
    await ws.functions();
    expect(venue.operations.run).toHaveBeenCalledWith('covia:functions', {});
  });

  it('describe calls covia:describe', async () => {
    await ws.describe('test:echo');
    expect(venue.operations.run).toHaveBeenCalledWith('covia:describe', { name: 'test:echo' });
  });

  it('adapters calls covia:adapters', async () => {
    await ws.adapters();
    expect(venue.operations.run).toHaveBeenCalledWith('covia:adapters', {});
  });
});
