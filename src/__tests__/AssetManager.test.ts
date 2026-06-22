import { AssetManager } from '../AssetManager';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockJsonOnce(data: any) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

function makeVenue() {
  return {
    baseUrl: 'https://v',
    venueId: 'did:web:v',
    auth: { apply: () => {} },
    operations: { run: jest.fn() },
  };
}

describe('AssetManager caching', () => {
  let am: AssetManager;

  beforeEach(() => {
    mockFetch.mockReset();
    am = new AssetManager(makeVenue() as any);
    am.clearCache();
  });

  it('caches content-addressed assets — second get is served from cache', async () => {
    mockJsonOnce({ metadata: { name: 'X' } });
    await am.get('abcdef0123'); // bare hash → content-addressed
    await am.get('abcdef0123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache mutable lattice paths — always re-fetches', async () => {
    mockJsonOnce({ metadata: { name: 'v1' } });
    mockJsonOnce({ metadata: { name: 'v2' } });
    await am.get('w/my-assets/foo');
    await am.get('w/my-assets/foo');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
