import { AdapterInfo, WorkspaceReadResult, WorkspaceSliceResult } from './types';

interface AdapterManagerVenue {
  workspace: {
    slice(path: string, offset?: number, limit?: number, ucans?: string[]): Promise<WorkspaceSliceResult>;
    read(path: string, maxSize?: number, ucans?: string[]): Promise<WorkspaceReadResult>;
  };
}

/**
 * Root of the per-adapter summaries the venue materialises into its lattice
 * at startup (`v/info/adapters/<name>` → `{name, description, operations}`,
 * per OPERATIONS.md §3) — the authoritative adapter registry, unlike
 * inferring adapter names from `metadata.operation.adapter` on the
 * operations catalog, which misses adapters with zero catalog operations.
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

function toAdapterInfo(name: string | undefined, value: AdapterSummary | undefined): AdapterInfo {
  return {
    name: value?.name ?? name ?? '',
    description: value?.description,
    operations: Array.isArray(value?.operations) ? value.operations : [],
  };
}

/**
 * Adapter introspection for a venue.
 *
 * Reads go through the workspace manager, so they are job-free (`GET
 * /api/v1/values/*`, covia #177) on 0.3+ venues and transparently fall back
 * to the invoke path on older ones — the same job-free/fallback behaviour
 * every other workspace-backed read gets, rather than a hand-rolled fetch.
 */
export class AdapterManager {
  constructor(private venue: AdapterManagerVenue) {}

  /**
   * List the adapters registered on the venue, with their descriptions and
   * invocable operation catalog paths. Registered-but-inactive or zero-op
   * adapters are included — this is the true registry, not an inference
   * from the operations catalog.
   */
  async list(): Promise<AdapterInfo[]> {
    const r = await this.venue.workspace.slice(ADAPTERS_PATH, 0, LIST_LIMIT);
    if (!r.exists || !Array.isArray(r.values)) return [];
    const out: AdapterInfo[] = [];
    for (const entry of r.values as unknown[]) {
      if (!entry || typeof entry !== 'object') continue;
      const key = 'key' in entry && typeof entry.key === 'string' ? entry.key : undefined;
      const value = ('value' in entry ? entry.value : entry) as AdapterSummary | undefined;
      out.push(toAdapterInfo(key, value));
    }
    return out;
  }

  /**
   * Get a single adapter's summary by name.
   * @param name - Adapter name, e.g. "mcp"
   * @returns {Promise<AdapterInfo | null>} `null` if no adapter with that name is registered
   */
  async get(name: string): Promise<AdapterInfo | null> {
    const r = await this.venue.workspace.read(`${ADAPTERS_PATH}/${encodeURIComponent(name)}`);
    if (!r.exists) return null;
    return toAdapterInfo(name, r.value as AdapterSummary);
  }
}
