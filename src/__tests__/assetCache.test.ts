import type { AssetMetadataStore } from '../asset-cache';

// The default store is chosen when asset-cache loads, from whether a global
// localStorage exists. Node has none, so each test installs a fake one and
// loads a fresh copy of the module.

class FakeStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

type CacheModule = typeof import('../asset-cache');

async function loadFresh(): Promise<CacheModule> {
  let mod!: CacheModule;
  await jest.isolateModulesAsync(async () => { mod = await import('../asset-cache'); });
  return mod;
}

function loadWith(storage: unknown): Promise<CacheModule> {
  (global as any).localStorage = storage;
  return loadFresh();
}

afterEach(() => {
  delete (global as any).localStorage;
});

describe('asset-cache default store', () => {
  it('is null when localStorage is unavailable', async () => {
    delete (global as any).localStorage;
    const mod = await loadFresh();
    expect(mod.getAssetMetadataStore()).toBeNull();
  });

  it('is null when accessing localStorage throws', async () => {
    Object.defineProperty(global, 'localStorage', {
      configurable: true,
      get() { throw new Error('SecurityError: storage disabled'); },
    });
    const mod = await loadFresh();
    expect(mod.getAssetMetadataStore()).toBeNull();
  });

  it('can be replaced and disabled', async () => {
    const mod = await loadWith(new FakeStorage());
    const custom: AssetMetadataStore = { get: () => undefined, put: () => {}, clear: () => {} };
    mod.setAssetMetadataStore(custom);
    expect(mod.getAssetMetadataStore()).toBe(custom);
    mod.setAssetMetadataStore(null);
    expect(mod.getAssetMetadataStore()).toBeNull();
  });
});

describe('asset-cache localStorage store', () => {
  let storage: FakeStorage;
  let store: AssetMetadataStore;

  beforeEach(async () => {
    storage = new FakeStorage();
    store = (await loadWith(storage)).getAssetMetadataStore()!;
    expect(store).not.toBeNull();
  });

  it('round-trips metadata under a prefixed key', () => {
    store.put('abc123', { name: 'Iris' });
    expect(storage.getItem('covia:asset-meta:abc123')).toBe(JSON.stringify({ name: 'Iris' }));
    expect(store.get('abc123')).toEqual({ name: 'Iris' });
  });

  it('returns undefined for a miss', () => {
    expect(store.get('nope')).toBeUndefined();
  });

  it('treats a corrupt entry as a miss', () => {
    storage.setItem('covia:asset-meta:bad', '{not json');
    expect(store.get('bad')).toBeUndefined();
  });

  it('swallows quota errors on put', () => {
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => store.put('abc', { name: 'x' })).not.toThrow();
    expect(store.get('abc')).toBeUndefined();
  });

  it('treats read errors as a miss', () => {
    storage.getItem = () => { throw new Error('storage disabled'); };
    expect(store.get('abc')).toBeUndefined();
  });

  it('clear() removes only its own entries', () => {
    store.put('a1', { name: 'a' });
    store.put('b2', { name: 'b' });
    storage.setItem('frontend:theme', 'dark');
    store.clear();
    expect(store.get('a1')).toBeUndefined();
    expect(store.get('b2')).toBeUndefined();
    expect(storage.getItem('frontend:theme')).toBe('dark');
    expect(storage.length).toBe(1);
  });

  it('clear() swallows storage errors', () => {
    Object.defineProperty(storage, 'length', { get() { throw new Error('storage disabled'); } });
    expect(() => store.clear()).not.toThrow();
  });
});

describe('normaliseHash', () => {
  it('strips 0x and lowercases', async () => {
    const { normaliseHash } = await loadWith(undefined);
    expect(normaliseHash('0xABCdef')).toBe('abcdef');
    expect(normaliseHash('ABCDEF')).toBe('abcdef');
    expect(normaliseHash('abcdef')).toBe('abcdef');
  });
});
