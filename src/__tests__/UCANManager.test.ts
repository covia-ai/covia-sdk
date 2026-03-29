import { UCANManager } from '../UCANManager';
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

describe('UCANManager', () => {
  let venue: VenueInterface;
  let ucan: UCANManager;

  beforeEach(() => {
    venue = createMockVenue();
    ucan = new UCANManager(venue);
  });

  it('issue calls ucan:issue with correct params', async () => {
    const att = [{ with: '/w/', can: 'crud/read' }];
    const exp = Math.floor(Date.now() / 1000) + 3600;

    await ucan.issue('did:key:z6MkBob', att, exp);
    expect(venue.run).toHaveBeenCalledWith('ucan:issue', {
      aud: 'did:key:z6MkBob',
      att,
      exp,
    });
  });
});
