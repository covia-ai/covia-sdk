import { SecretManager } from '../SecretManager';

function createMockVenue() {
  return {
    operations: { run: jest.fn().mockResolvedValue({}) },
    listSecrets: jest.fn().mockResolvedValue(['API_KEY', 'DB_PASS']),
    putSecret: jest.fn().mockResolvedValue(undefined),
    deleteSecret: jest.fn().mockResolvedValue(undefined),
  };
}

describe('SecretManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let secrets: SecretManager;

  beforeEach(() => {
    venue = createMockVenue();
    secrets = new SecretManager(venue as any);
  });

  it('set calls secret:set via operations.run', async () => {
    await secrets.set('API_KEY', 'my-secret');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/secret/set', { name: 'API_KEY', value: 'my-secret' });
  });

  it('extract calls secret:extract via operations.run', async () => {
    await secrets.extract('API_KEY');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/secret/extract', { name: 'API_KEY' });
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
