import { WorkspaceManager } from '../WorkspaceManager';
import { NotFoundError, UnsupportedVenueFeatureError } from '../types';

// Reads are job-free GETs to /api/v1/values/* (covia #177); writes stay on the
// invoke/job path. So the tests split: fetch is mocked for the GET read surface,
// operations.run for the write surface. Unsupported reads reject rather than
// silently persisting jobs.
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function createMockVenue() {
  return {
    baseUrl: 'https://venue.example',
    venueId: 'did:key:zVenue',
    auth: { apply: jest.fn((h: Record<string, string>) => { h['Authorization'] = 'Bearer tok'; }) },
    operations: { run: jest.fn().mockResolvedValue({}) },
  };
}

function okJson(data: any) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

/** The URL of the Nth fetch call. */
function fetchUrl(n = 0): string {
  return String(mockFetch.mock.calls[n][0]);
}

describe('WorkspaceManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let ws: WorkspaceManager;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = createMockVenue();
    ws = new WorkspaceManager(venue);
  });

  // ── reads → job-free GET /api/v1/values/* ──────────────────────────────────

  it('read GETs /values/read (no job) and binds auth', async () => {
    okJson({ exists: true, value: 1 });
    const r = await ws.read('w/mydata', 500);
    expect(venue.operations.run).not.toHaveBeenCalled();            // NOT the job path
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/read');
    expect(u.searchParams.get('path')).toBe('w/mydata');
    expect(u.searchParams.get('maxSize')).toBe('500');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok'); // aud-bound identity
    expect(r.exists).toBe(true);
  });

  it('list GETs /values/list with a path', async () => {
    okJson({ exists: true, type: 'Map', count: 42, keys: [] });
    const r = await ws.list('w/health/appointments', 10, 0);
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/list');
    expect(u.searchParams.get('path')).toBe('w/health/appointments');
    expect(u.searchParams.get('limit')).toBe('10');
    expect(r.count).toBe(42);                                        // 0.3.0 cardinality word
  });

  it('slice GETs /values/slice', async () => {
    okJson({ exists: true, type: 'Vector', count: 190, values: [] });
    await ws.slice('w/events', 5, 10);
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/slice');
    expect(u.searchParams.get('offset')).toBe('5');
    expect(u.searchParams.get('limit')).toBe('10');
  });

  it('inspect GETs /values/inspect for a single path', async () => {
    okJson({ result: '…' });
    await ws.inspect('w/health', 500);
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/inspect');
    expect(u.searchParams.get('path')).toBe('w/health');
    expect(u.searchParams.get('budget')).toBe('500');
  });

  // ── new tallies (#177) — server-side count / group-by ──────────────────────

  it('count GETs /values/count with depth', async () => {
    okJson({ exists: true, count: 190 });
    const r = await ws.count('w/health/appointments', { depth: 2 });
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/count');
    expect(u.searchParams.get('path')).toBe('w/health/appointments');
    expect(u.searchParams.get('depth')).toBe('2');
    expect(r.count).toBe(190);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('aggregate GETs /values/aggregate with depth + groupBy', async () => {
    okJson({ exists: true, count: 644, groups: { nhs: { count: 596 }, letters: { count: 48 } } });
    const r = await ws.aggregate('w/health', { depth: 2, groupBy: 'source' });
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/aggregate');
    expect(u.searchParams.get('groupBy')).toBe('source');
    expect(u.searchParams.get('depth')).toBe('2');
    expect(r.groups?.nhs.count).toBe(596);
  });

  it('omits undefined query params (e.g. aggregate without groupBy)', async () => {
    okJson({ exists: true, count: 3 });
    await ws.aggregate('w/x');
    const u = new URL(fetchUrl());
    expect(u.searchParams.has('groupBy')).toBe(false);
    expect(u.searchParams.has('depth')).toBe(false);
  });

  // ── writes stay on the invoke/job path (audit) ─────────────────────────────

  it('write calls v/ops/covia/write', async () => {
    await ws.write('w/mydata', { key: 'value' });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/write', { path: 'w/mydata', value: { key: 'value' } }, { ucans: undefined });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('delete calls v/ops/covia/delete', async () => {
    await ws.delete('w/mydata');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/delete', { path: 'w/mydata' }, { ucans: undefined });
  });

  it('append calls v/ops/covia/append', async () => {
    await ws.append('w/mylist', 'item');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/append', { path: 'w/mylist', value: 'item' }, { ucans: undefined });
  });

  it('copy calls v/ops/covia/copy', async () => {
    await ws.copy('v/ops/json/merge', 'o/merge');
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/copy', { from: 'v/ops/json/merge', to: 'o/merge' }, { ucans: undefined });
  });

  // ── reads unsupported by job-free transport reject without invoking ───────

  it('a read with ucans rejects rather than creating a job', async () => {
    await expect(ws.read('did:key:zAlice/w/shared', undefined, ['eyJ.proof']))
      .rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(venue.operations.run).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('a rootless list normalises to "/" and stays on the job-free GET (#16: it used to mint a Job)', async () => {
    okJson({ exists: true, type: 'Map', count: 2, keys: ['j', 'meta'] });
    const r = await ws.list();
    expect(venue.operations.run).not.toHaveBeenCalled();            // NOT the job path
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/list');
    expect(u.searchParams.get('path')).toBe('/');
    expect(r.keys).toEqual(['j', 'meta']);
  });

  it('multi-path inspect rejects rather than creating a job', async () => {
    await expect(ws.inspect(['v/ops/json/merge', 'w/mydata'], 2000, false))
      .rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('count with ucans rejects rather than creating a job', async () => {
    await expect(ws.count('did:key:zAlice/w/x', { depth: 2, ucans: ['eyJ.proof'] }))
      .rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  // ── old venues (< 0.3, no /values routes): reject and remember ─────────────
  // A 404 can only mean the route is missing — an absent path is 200 {exists:false}.

  function notFound() {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 404,
      json: () => Promise.resolve({ error: 'Endpoint GET /api/v1/values/read not found' }),
      text: () => Promise.resolve('{"error": "Endpoint GET /api/v1/values/read not found"}'),
    });
  }

  it('a read against a pre-0.3 venue rejects without invoking', async () => {
    notFound();
    await expect(ws.read('w/mydata')).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('remembers a pre-0.3 venue — later reads skip the GET probe entirely', async () => {
    notFound();
    await expect(ws.read('w/first')).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    await expect(ws.list('w/second')).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(mockFetch).toHaveBeenCalledTimes(1);                     // only the first probe
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('a status without a version marks the venue pre-0.3 — no GET probe at all', async () => {
    (venue as any).lastKnownStatus = { name: 'Old Stable', did: 'did:key:zVenue' }; // no version field
    await expect(ws.read('w/mydata')).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('a status reporting ≥0.3 keeps reads on the job-free GET path', async () => {
    (venue as any).lastKnownStatus = { version: '0.3.0-SNAPSHOT' };
    okJson({ exists: true, value: 1 });
    await ws.read('w/mydata');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('a status arriving after the manager exists still downgrades pre-0.3 venues', async () => {
    okJson({ exists: true, value: 1 });
    await ws.read('w/first');                                       // GET while nothing is known
    (venue as any).lastKnownStatus = { version: '0.2.5' };          // e.g. venue.status() resolved
    await expect(ws.read('w/second')).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(mockFetch).toHaveBeenCalledTimes(1);                     // no second GET
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('bodiless GETs carry no Content-Type (keeps browser CORS requests simple)', async () => {
    okJson({ exists: true, value: 1 });
    await ws.read('w/mydata');
    expect(mockFetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  });

  it('a stray 404 without the unmapped-endpoint body propagates and does not latch', async () => {
    // A reverse proxy or mid-deploy gateway can 404 a perfectly good route.
    // Only the venue's distinctive "Endpoint GET ... not found" body proves
    // the route is absent; anything else must not permanently downgrade
    // every workspace read on this connection.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('<html>proxy: no upstream</html>'),
    });
    await expect(ws.read('w/first')).rejects.toBeInstanceOf(NotFoundError);

    okJson({ exists: true, value: 42 });
    await expect(ws.read('w/second')).resolves.toMatchObject({ value: 42 });
    expect(mockFetch).toHaveBeenCalledTimes(2);                     // still on the GET path
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('non-404 errors from the GET surface propagate — no invoke fallback', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 403,
      json: () => Promise.resolve({ error: 'Capability denied' }),
      text: () => Promise.resolve('{"error": "Capability denied"}'),
    });
    await expect(ws.read('w/private')).rejects.toThrow();
    expect(venue.operations.run).not.toHaveBeenCalled();
  });
});
