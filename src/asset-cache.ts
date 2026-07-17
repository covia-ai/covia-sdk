import { AssetMetadata } from './types';

/**
 * Pluggable persistent store for content-addressed asset metadata.
 *
 * An asset id is the Convex value hash of its metadata (`AMap.getHash()`
 * venue-side), so hash → metadata is immutable: entries never go stale and are
 * safe to cache indefinitely, across sessions and across venues. Keys are the
 * normalised bare hash (lowercase, no `0x`), so `<hash>`, `0x<hash>` and
 * `<DID>/a/<hash>` refs all share one entry.
 *
 * Trust model: entries are cached as returned by the venue that served them.
 * Provable verification — recomputing the Convex value hash of the metadata
 * and rejecting mismatches — requires a canonical CVM cell encoder in
 * TypeScript, which does not exist yet; when it lands, verification will gate
 * admission to this cache so entries are correct by construction rather than
 * by trust. Until then this is a availability/performance cache with the same
 * trust as an uncached fetch from the same venue.
 */
export interface AssetMetadataStore {
  get(hash: string): AssetMetadata | undefined;
  put(hash: string, metadata: AssetMetadata): void;
  clear(): void;
}

const PREFIX = 'covia:asset-meta:';

/** Browser-persistent store over localStorage. All failures (quota, parse,
 *  storage disabled) degrade to cache misses — the store is best-effort. */
class LocalStorageMetadataStore implements AssetMetadataStore {
  get(hash: string): AssetMetadata | undefined {
    try {
      const raw = localStorage.getItem(PREFIX + hash);
      return raw ? (JSON.parse(raw) as AssetMetadata) : undefined;
    } catch {
      return undefined;
    }
  }
  put(hash: string, metadata: AssetMetadata): void {
    try {
      localStorage.setItem(PREFIX + hash, JSON.stringify(metadata));
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

/** Canonical persistent-cache key for a content hash ref: lowercase bare hex. */
export function normaliseHash(hash: string): string {
  return (hash.startsWith('0x') ? hash.slice(2) : hash).toLowerCase();
}
