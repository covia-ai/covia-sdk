import { AssetManager } from '../AssetManager';
import { Operation } from '../Operation';
import { DataAsset } from '../DataAsset';

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
    am = new AssetManager(makeVenue());
    am.clearCache();
  });

  it('caches content-addressed assets — second get is served from cache', async () => {
    mockJsonOnce({ name: 'X' });
    await am.get('abcdef0123'); // bare hash → content-addressed
    await am.get('abcdef0123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache mutable lattice paths — always re-fetches', async () => {
    mockJsonOnce({ name: 'v1' });
    mockJsonOnce({ name: 'v2' });
    await am.get('w/my-assets/foo');
    await am.get('w/my-assets/foo');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // The GET body is the asset metadata directly (no envelope), so an `operation`
  // field at the top level marks an Operation. (Regression: the SDK previously
  // looked for `data.metadata.operation`, so every asset became a DataAsset.)
  it('classifies an operation asset as Operation and exposes metadata directly', async () => {
    mockJsonOnce({ name: 'op', operation: { adapter: 'test:echo' } });
    const asset = await am.get('deadbeef01');
    expect(asset).toBeInstanceOf(Operation);
    expect(asset.metadata.name).toBe('op'); // metadata is the body itself — no wrapper
  });

  it('classifies a plain asset (no operation field) as DataAsset', async () => {
    mockJsonOnce({ name: 'data' });
    const asset = await am.get('deadbeef02');
    expect(asset).toBeInstanceOf(DataAsset);
  });
});
