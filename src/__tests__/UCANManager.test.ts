import { UCANManager } from '../UCANManager';

function createMockVenue() {
  return {
    operations: { run: jest.fn().mockResolvedValue({}) },
  };
}

describe('UCANManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let ucan: UCANManager;

  beforeEach(() => {
    venue = createMockVenue();
    ucan = new UCANManager(venue as any);
  });

  it('issue calls ucan:issue with correct params', async () => {
    const att = [{ with: '/w/', can: 'crud/read' }];
    const exp = Math.floor(Date.now() / 1000) + 3600;

    await ucan.issue('did:key:z6MkBob', att, exp);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/ucan/issue', {
      aud: 'did:key:z6MkBob',
      att,
      exp,
    });
  });
});
