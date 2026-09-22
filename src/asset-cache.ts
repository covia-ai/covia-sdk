import { AssetMetadata } from './types';
import { assetHash, Namespace, parseDidUrl } from './did';

/**
 * Pluggable persistent store for content-addressed asset metadata.
 *
 * Keys are the **fully qualified** `<ownerDID>/a/<hash>` form, and only that
 * form is admitted. A bare hash or `a/<hash>` is *caller-relative*: it names
 * the asset in the requesting caller's own `a/` namespace, so the same bytes
 * registered by two principals are two records, each readable only under its
 * owner's authority (covia#502, `venue/docs/OPERATIONS.md` §"Content-addressed
 * forms are caller-relative, not global"). Covia has no global lookup by hash.
 * Keying this store on a bare hash would therefore let an entry populated
 * under one identity be served back to another that may have no right to read
 * it — and this store is cross-session by design, outliving the auth that
 * filled it. `persistentCacheKey` returns null for those refs, and
 * `AssetManager` keeps them in its own venue-local memory cache instead.
 *
 * Trust model: entries are cached as returned by the venue that served them.
 * Provable verification — recomputing the Convex value hash of the metadata
 * and rejecting mismatches — requires a canonical CVM cell encoder in
 * TypeScript, which does not exist yet (covia-sdk#18); when it lands,
 * verification will gate admission to this cache so entries are correct by
 * construction rather than by trust. Until then this is an
 * availability/performance cache with the same trust as an uncached fetch
 * from the same venue.
 */
export interface AssetMetadataStore {
  get(key: string): AssetMetadata | undefined;
  put(key: string, metadata: AssetMetadata): void;
  clear(): void;
}

// Unchanged across the covia#502 key-scheme change: a `<did>/a/<hash>` key can
// never collide with the bare hex this store used to write, so pre-existing
// entries are simply unreachable, and `clear()` still sweeps them away.
const PREFIX = 'covia:asset-meta:';

/** Browser-persistent store over localStorage. All failures (quota, parse,
 *  storage disabled) degrade to cache misses — the store is best-effort. */
class LocalStorageMetadataStore implements AssetMetadataStore {
  get(key: string): AssetMetadata | undefined {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as AssetMetadata) : undefined;
    } catch {
      return undefined;
    }
  }
  put(key: string, metadata: AssetMetadata): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(metadata));
    } catch {
      /* quota or unavailable — best-effort */
    }
  }
  clear(): void {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) doomed.push(key);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* best-effort */
    }
  }
}

function detectDefaultStore(): AssetMetadataStore | null {
  try {
    return typeof localStorage !== 'undefined' ? new LocalStorageMetadataStore() : null;
  } catch {
    return null;
  }
}

let store: AssetMetadataStore | null = detectDefaultStore();

/** Replace the persistent metadata store (e.g. a file-backed store in Node),
 *  or pass `null` to disable persistence. Browsers default to localStorage. */
export function setAssetMetadataStore(s: AssetMetadataStore | null): void {
  store = s;
}

export function getAssetMetadataStore(): AssetMetadataStore | null {
  return store;
}

/** Canonical bare hex for a content hash: lowercase, no `0x`. */
export function normaliseHash(hash: string): string {
  return (hash.startsWith('0x') ? hash.slice(2) : hash).toLowerCase();
}

/**
 * The persistent-store key for `ref`, or null if `ref` must not be persisted.
 *
 * Only a DID-qualified content ref (`<ownerDID>/a/<hash>`) is portable enough
 * to key a cross-session, cross-identity store — see this module's header.
 * A bare hash, `a/<hash>`, or any mutable lattice path returns null.
 */
export function persistentCacheKey(ref: string): string | null {
  const parsed = parseDidUrl(ref);
  if (!parsed.did) return null;
  if (parsed.namespace !== Namespace.ASSET) return null;
  const hash = assetHash(ref);
  if (!hash) return null;
  // `assetHash` validates hex only on its bare-hash branch; a DID-qualified
  // `a/` segment is returned as-is. Re-check here, so nothing but an actual
  // content hash can key a durable store.
  const bare = normaliseHash(hash);
  return /^[0-9a-f]+$/.test(bare) ? `${parsed.did}/${Namespace.ASSET}/${bare}` : null;
}
