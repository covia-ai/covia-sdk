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

describe('persistentCacheKey (covia-sdk#47)', () => {
  const DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
  const HASH = '0e7f1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829304a5b6c7d8';

  it('keys a DID-qualified content ref on the fully qualified form', async () => {
    const { persistentCacheKey } = await loadWith(undefined);
    expect(persistentCacheKey(`${DID}/a/${HASH}`)).toBe(`${DID}/a/${HASH}`);
  });

  it('normalises the hash inside the key', async () => {
    const { persistentCacheKey } = await loadWith(undefined);
    expect(persistentCacheKey(`${DID}/a/0x${HASH.toUpperCase()}`)).toBe(`${DID}/a/${HASH}`);
  });

  // The whole point of the issue: these resolve against the *caller's* own a/
  // namespace, so they must never key a store that outlives the identity.
  it('refuses a bare hash', async () => {
    const { persistentCacheKey } = await loadWith(undefined);
    expect(persistentCacheKey(HASH)).toBeNull();
    expect(persistentCacheKey(`0x${HASH}`)).toBeNull();
  });

  it('refuses a caller-relative a/<hash>', async () => {
    const { persistentCacheKey } = await loadWith(undefined);
    expect(persistentCacheKey(`a/${HASH}`)).toBeNull();
  });

  it('refuses mutable lattice paths, qualified or not', async () => {
    const { persistentCacheKey } = await loadWith(undefined);
    expect(persistentCacheKey('w/my-assets/foo')).toBeNull();
    expect(persistentCacheKey('o/my-op')).toBeNull();
    expect(persistentCacheKey(`${DID}/w/my-assets/foo`)).toBeNull();
  });

  it('refuses a DID-qualified a/ path that is not a single hash', async () => {
    const { persistentCacheKey } = await loadWith(undefined);
    expect(persistentCacheKey(`${DID}/a/${HASH}/extra`)).toBeNull();
    expect(persistentCacheKey(`${DID}/a/not-hex-at-all`)).toBeNull();
  });
});
