import { AdapterInfo, WorkspaceReadResult, WorkspaceSliceResult } from './types';

interface AdapterManagerVenue {
  workspace: {
    slice(path: string, offset?: number, limit?: number, ucans?: string[]): Promise<WorkspaceSliceResult>;
    read(path: string, maxSize?: number, ucans?: string[]): Promise<WorkspaceReadResult>;
  };
}

/**
 * Adapter introspection for a venue.
 *
 * The venue materialises a per-adapter summary into its lattice at startup
 * (`v/info/adapters/<name>` → `{name, description, operations}`, per
 * OPERATIONS.md §3). This manager is a thin projection over that canonical
 * data — reads go through the workspace manager, so they are job-free on
 * 0.3+ venues and transparently fall back to the invoke path on older ones.
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
    const r = await this.venue.workspace.slice('v/info/adapters', 0, 1000);
    if (!r.exists || !r.values) return [];
    // Map slices come back as {key, value} entries; the summary is the value.
    const out: AdapterInfo[] = [];
    const values: unknown[] = r.values;
    for (const entry of values) {
      if (!entry || typeof entry !== 'object') continue;
      const info = 'value' in entry ? entry.value : entry;
      if (info && typeof info === 'object') out.push(info as AdapterInfo);
    }
    return out;
  }

  /** A single adapter's summary, or `null` if no such adapter is registered. */
  async get(name: string): Promise<AdapterInfo | null> {
    const r = await this.venue.workspace.read(`v/info/adapters/${name}`);
    return r.exists ? (r.value as AdapterInfo) : null;
  }
}
