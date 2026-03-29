import { SecretManager } from '../SecretManager';
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
    listSecrets: jest.fn().mockResolvedValue(['API_KEY', 'DB_PASS']),
    putSecret: jest.fn().mockResolvedValue(undefined),
    deleteSecret: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
  } as unknown as VenueInterface;
}

describe('SecretManager', () => {
  let venue: VenueInterface;
  let secrets: SecretManager;

  beforeEach(() => {
    venue = createMockVenue();
    secrets = new SecretManager(venue);
  });

  it('set calls secret:set via run', async () => {
    await secrets.set('API_KEY', 'my-secret');
    expect(venue.run).toHaveBeenCalledWith('secret:set', { name: 'API_KEY', value: 'my-secret' });
  });

  it('extract calls secret:extract via run', async () => {
    await secrets.extract('API_KEY');
    expect(venue.run).toHaveBeenCalledWith('secret:extract', { name: 'API_KEY' });
  });

  it('list delegates to venue.listSecrets', async () => {
    const names = await secrets.list();
    expect(venue.listSecrets).toHaveBeenCalled();
    expect(names).toEqual(['API_KEY', 'DB_PASS']);
  });

  it('put delegates to venue.putSecret', async () => {
    await secrets.put('API_KEY', 'new-value');
    expect(venue.putSecret).toHaveBeenCalledWith('API_KEY', 'new-value');
  });

  it('delete delegates to venue.deleteSecret', async () => {
    await secrets.delete('API_KEY');
    expect(venue.deleteSecret).toHaveBeenCalledWith('API_KEY');
  });
});
