import {
  DLFSDrivesResult,
  DLFSListResult,
  NotFoundError,
  StatusData,
  UnsupportedVenueFeatureError,
} from './types';
import { venueJson, venueStream, VenueRequestContext } from './VenueTransport';
import { ROUTE_MISSING_404 } from './venue-features';

interface DLFSManagerVenue extends VenueRequestContext {
  lastKnownStatus?: StatusData;
}

export class DLFSManager {
  // Whether this venue serves GET /api/v1/dlfs/* — flipped on a route-missing
  // 404 so a pre-#253 venue pays the probe once, not one failed GET per read.
  private dlfsSupported = true;

  constructor(private venue: DLFSManagerVenue) {}

  /** A job-free DLFS metadata GET that rejects when the endpoint is unavailable. */
  private async dlfsGet<T>(path: string): Promise<T> {
    if (!this.dlfsSupported) throw new UnsupportedVenueFeatureError('venue DLFS browsing');
    try {
      return await venueJson<T>(this.venue, `/api/v1/dlfs${path}`);
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
      // A missing/never-created drive 404s too — only the distinctive
      // unmapped-endpoint body proves the route itself is absent; any other
      // 404 must propagate to the caller (see AgentManager, covia#180, for
      // why latching on a per-resource 404 is the wrong call).
      if (!ROUTE_MISSING_404.test(e.message)) throw e;
      this.dlfsSupported = false;
      throw new UnsupportedVenueFeatureError('venue DLFS browsing');
    }
  }

  /**
   * List the caller's DLFS drives, vault included. **Job-free** on covia
   * venues serving `GET /api/v1/dlfs/drives` (covia#253).
   */
  async listDrives(): Promise<DLFSDrivesResult> {
    return this.dlfsGet<DLFSDrivesResult>('/drives');
  }

  /**
   * List one directory of a drive. **Job-free** on covia venues serving
   * `GET /api/v1/dlfs/list` (covia#253). Own drives by bare name only —
   * cross-user DID-URL drive addressing isn't supported by this manager.
   */
  async list(drive: string, path?: string): Promise<DLFSListResult> {
    const qs = new URLSearchParams({ drive, ...(path ? { path } : {}) });
    return this.dlfsGet<DLFSListResult>(`/list?${qs}`);
  }

  /**
   * Job-free file content — `GET /api/v1/content/dlfs/<drive>/<path>`, the
   * same route the venue's generic asset-content resolver already serves
   * (DLFSAdapter implements ContentProvider). Real streamed bytes with a
   * correct Content-Type, not the JSON/base64 shape `dlfs:read` returns.
   */
  async getContent(drive: string, path: string): Promise<ReadableStream<Uint8Array>> {
    const segments = path
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    const response = await venueStream(
      this.venue,
      `/api/v1/content/dlfs/${encodeURIComponent(drive)}/${segments}`,
    );
    if (!response.body) throw new Error('Empty response body for DLFS content read');
    return response.body;
  }
}
