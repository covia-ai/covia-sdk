import { AssetManager } from '../AssetManager';
import { Operation } from '../Operation';
import { DataAsset } from '../DataAsset';
import { setAssetMetadataStore, AssetMetadataStore } from '../asset-cache';
import { AssetMetadata } from '../types';

// Map-backed persistent store (Node has no localStorage; browsers get one by default).
function makeStore() {
  const map = new Map<string, AssetMetadata>();
  const store: AssetMetadataStore = {
    get: (h) => map.get(h),
    put: (h, m) => void map.set(h, m),
    clear: () => map.clear(),
  };
  return { store, map };
}

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

describe('AssetManager persistent metadata store', () => {
  let am: AssetManager;

  afterEach(() => {
    am?.clearPersistentCache();
    setAssetMetadataStore(null);
    am?.clearCache();
  });

  beforeEach(() => {
    mockFetch.mockReset();
    am = new AssetManager(makeVenue());
    setAssetMetadataStore(null);
    am.clearCache();
  });

  it('serves a content-addressed get from the store without fetching', async () => {
    const { store, map } = makeStore();
    map.set('abcdef0123', { name: 'From store' });
    setAssetMetadataStore(store);

    const asset = await am.get('abcdef0123');
    expect(asset.metadata.name).toBe('From store');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('populates the store on fetch, keyed by normalised bare hash', async () => {
    const { store, map } = makeStore();
    setAssetMetadataStore(store);

    mockJsonOnce({ name: 'Fetched' });
    await am.get('0xABCDEF0123'); // 0x-prefixed, uppercase ref
    expect(map.get('abcdef0123')).toEqual({ name: 'Fetched' });
  });

  it('shares one entry across ref forms of the same hash', async () => {
    const { store, map } = makeStore();
    map.set('abcdef0123', { name: 'Shared' });
    setAssetMetadataStore(store);

    await expect(am.get('0xABCDEF0123')).resolves.toBeInstanceOf(DataAsset);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never persists mutable lattice paths', async () => {
    const { store, map } = makeStore();
    setAssetMetadataStore(store);

    mockJsonOnce({ name: 'mutable' });
    await am.get('w/my-assets/foo');
    expect(map.size).toBe(0);
  });

  it('separates venue-local and persistent cache clearing', async () => {
    const { store, map } = makeStore();
    map.set('abcdef0123', { name: 'X' });
    setAssetMetadataStore(store);

    am.clearCache();
    expect(map.size).toBe(1);

    am.clearPersistentCache();
    expect(map.size).toBe(0);
  });
});

describe('AssetManager.listMine', () => {
  let am: AssetManager;

  beforeEach(() => {
    mockFetch.mockReset();
    am = new AssetManager(makeVenue());
  });

  it('hits the job-free GET /api/v1/assets?scope=own endpoint, not the venue-wide catalog', async () => {
    mockJsonOnce({ items: [{ id: 'a1', name: 'Mine', type: 'document', description: 'x' }], total: 1, offset: 0, limit: 100 });
    const result = await am.listMine();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://v/api/v1/assets?scope=own&offset=0');
    expect(result.items).toEqual([{ id: 'a1', name: 'Mine', type: 'document', description: 'x' }]);
  });

  it('passes offset/limit through as query params', async () => {
    mockJsonOnce({ items: [], total: 0, offset: 5, limit: 10 });
    await am.listMine({ offset: 5, limit: 10 });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://v/api/v1/assets?scope=own&offset=5&limit=10');
  });
});

describe('AssetManager read authentication', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setAssetMetadataStore(null);
  });

  it('applies venue auth without a content type to every asset GET', async () => {
    const apply = jest.fn((headers: Record<string, string>, _audience?: string) => {
      headers.Authorization = 'Bearer token';
    });
    const am = new AssetManager({
      baseUrl: 'https://v',
      venueId: 'did:web:v',
      auth: { apply },
      operations: { run: jest.fn() },
    });
    am.clearCache();

    mockJsonOnce({ name: 'Asset' });
    mockJsonOnce({ items: ['a1'], total: 1, offset: 0, limit: 100 });
    mockJsonOnce({ items: [], total: 0, offset: 0, limit: 100 });
    mockJsonOnce({ name: 'Metadata' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>(),
    });

    await am.get('w/assets/auth-test');
    await am.list();
    await am.listMine();
    await am.getMetadata('asset-1');
    await am.getContent('asset-1');

    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(apply).toHaveBeenCalledTimes(5);
    for (const call of apply.mock.calls) {
      expect(call[1]).toBe('did:web:v');
    }
    for (const [, options] of mockFetch.mock.calls) {
      const headers = options?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer token');
      expect(headers['Content-Type']).toBeUndefined();
    }
  });
});
