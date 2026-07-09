import { fetchWithError } from './Utils';
import { AdapterInfo } from './types';

interface AdapterManagerVenue {
  baseUrl: string;
  venueId: string;
  auth: { apply(headers: Record<string, string>, audience?: string): void };
}

/**
 * Root of the per-adapter summaries the venue materialises into the lattice
 * at startup (`Engine.materialiseVenueInfo`) — the authoritative adapter
 * list, unlike inferring adapter names from `metadata.operation.adapter` on
 * the operations catalog, which misses adapters with zero catalog operations.
 */
const ADAPTERS_PATH = 'v/info/adapters';

// Comfortably above any real venue's adapter count so a single slice call
// always returns everything without needing pagination.
const LIST_LIMIT = 1000;

interface AdapterSummary {
  name?: string;
  description?: string;
  operations?: string[];
}

interface AdaptersSliceResult {
  exists: boolean;
  values?: { key?: string; value?: AdapterSummary }[];
}

interface AdapterReadResult {
  exists: boolean;
  value?: AdapterSummary;
}

function toAdapterInfo(name: string | undefined, value: AdapterSummary | undefined): AdapterInfo {
  return {
    name: value?.name ?? name ?? '',
    description: value?.description,
    operations: Array.isArray(value?.operations) ? value.operations : [],
  };
}

/**
 * Adapter discovery, read job-free from `v/info/adapters` via
 * `GET /api/v1/values/*` (covia #177) — synchronous, capability-checked, no
 * Job persisted. Requires a venue >= 0.3.0; there is no invoke-path fallback
 * (unlike {@link WorkspaceManager}) since adapter listing has no `covia:*` op.
 */
export class AdapterManager {
  constructor(private venue: AdapterManagerVenue) {}

  private _headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    this.venue.auth.apply(headers, this.venue.venueId);
    return headers;
  }

  private _values<T>(op: string, params: Record<string, string | number | undefined>): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    return fetchWithError<T>(`${this.venue.baseUrl}/api/v1/values/${op}?${qs.toString()}`, { headers: this._headers() });
  }

  /**
   * List all adapters registered on this venue.
   * @returns {Promise<AdapterInfo[]>}
   */
  async list(): Promise<AdapterInfo[]> {
    const result = await this._values<AdaptersSliceResult>('slice', { path: ADAPTERS_PATH, limit: LIST_LIMIT });
    if (!result.exists) return [];
    return (result.values ?? []).map((entry) => toAdapterInfo(entry.key, entry.value));
  }

  /**
   * Get a single adapter's summary by name.
   * @param name - Adapter name, e.g. "mcp"
   * @returns {Promise<AdapterInfo | null>} `null` if no adapter with that name is registered
   */
  async get(name: string): Promise<AdapterInfo | null> {
    const result = await this._values<AdapterReadResult>('read', { path: `${ADAPTERS_PATH}/${encodeURIComponent(name)}` });
    if (!result.exists) return null;
    return toAdapterInfo(name, result.value);
  }
}
