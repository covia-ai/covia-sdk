import { WorkspaceManager } from '../WorkspaceManager';
import { VenueInterface } from '../types';

function createMockVenue(): VenueInterface {
  return {
    baseUrl: 'https://example.com',
    venueId: 'did:web:example.com',
    metadata: { name: 'Test' },
    run: jest.fn().mockResolvedValue({}),
    invoke: jest.fn(),
    cancelJob: jest.fn(), deleteJob: jest.fn(), sendJobMessage: jest.fn(),
    pauseJob: jest.fn(), resumeJob: jest.fn(), status: jest.fn(),
    getJob: jest.fn(), listJobs: jest.fn(), getAsset: jest.fn(),
    register: jest.fn(), getMetadata: jest.fn(), readStream: jest.fn(),
    putContent: jest.fn(), getContent: jest.fn(),
    listAssets: jest.fn(), listOperations: jest.fn(), getOperation: jest.fn(),
    didDocument: jest.fn(), mcpDiscovery: jest.fn(), agentCard: jest.fn(),
    streamJobEvents: jest.fn(),
    listSecrets: jest.fn(), putSecret: jest.fn(), deleteSecret: jest.fn(),
    close: jest.fn(),
  } as unknown as VenueInterface;
}

describe('WorkspaceManager', () => {
  let venue: VenueInterface;
  let ws: WorkspaceManager;

  beforeEach(() => {
    venue = createMockVenue();
    ws = new WorkspaceManager(venue);
  });

  it('read calls covia:read', async () => {
    await ws.read('w/mydata', 500);
    expect(venue.run).toHaveBeenCalledWith('covia:read', { path: 'w/mydata', maxSize: 500 });
  });

  it('write calls covia:write', async () => {
    await ws.write('w/mydata', { key: 'value' });
    expect(venue.run).toHaveBeenCalledWith('covia:write', { path: 'w/mydata', value: { key: 'value' } });
  });

  it('delete calls covia:delete', async () => {
    await ws.delete('w/mydata');
    expect(venue.run).toHaveBeenCalledWith('covia:delete', { path: 'w/mydata' });
  });

  it('append calls covia:append', async () => {
    await ws.append('w/mylist', 'item');
    expect(venue.run).toHaveBeenCalledWith('covia:append', { path: 'w/mylist', value: 'item' });
  });

  it('list calls covia:list', async () => {
    await ws.list('w/', 10, 0);
    expect(venue.run).toHaveBeenCalledWith('covia:list', { path: 'w/', limit: 10, offset: 0 });
  });

  it('slice calls covia:slice', async () => {
    await ws.slice('w/mylist', 5, 10);
    expect(venue.run).toHaveBeenCalledWith('covia:slice', { path: 'w/mylist', offset: 5, limit: 10 });
  });

  it('functions calls covia:functions', async () => {
    await ws.functions();
    expect(venue.run).toHaveBeenCalledWith('covia:functions', {});
  });

  it('describe calls covia:describe', async () => {
    await ws.describe('test:echo');
    expect(venue.run).toHaveBeenCalledWith('covia:describe', { name: 'test:echo' });
  });

  it('adapters calls covia:adapters', async () => {
    await ws.adapters();
    expect(venue.run).toHaveBeenCalledWith('covia:adapters', {});
  });
});
