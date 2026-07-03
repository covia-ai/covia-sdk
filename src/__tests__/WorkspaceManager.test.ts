import { WorkspaceManager } from '../WorkspaceManager';

// Reads are job-free GETs to /api/v1/values/* (covia #177); writes stay on the
// invoke/job path. So the tests split: fetch is mocked for the GET read surface,
// operations.run for the write surface (and the cross-DID / old-venue fallbacks).
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
    ws = new WorkspaceManager(venue as any);
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

  // ── fallbacks to the invoke path: cross-DID proofs, multi-path, old venues ──

  it('a read with ucans (cross-DID proof) falls back to the invoke path', async () => {
    await ws.read('did:key:zAlice/w/shared', undefined, ['eyJ.proof']);
    expect(venue.operations.run).toHaveBeenCalledWith(
      'v/ops/covia/read', { path: 'did:key:zAlice/w/shared', maxSize: undefined }, { ucans: ['eyJ.proof'] });
    expect(mockFetch).not.toHaveBeenCalled();                       // no job-free GET when proofs are needed
  });

  it('a rootless list falls back to the invoke path (GET route needs a path)', async () => {
    await ws.list();
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/list', { path: undefined, limit: undefined, offset: undefined }, { ucans: undefined });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('multi-path inspect falls back to the invoke path', async () => {
    await ws.inspect(['v/ops/json/merge', 'w/mydata'], 2000, false);
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/inspect', { paths: ['v/ops/json/merge', 'w/mydata'], budget: 2000, compact: false }, { ucans: undefined });
  });

  it('count with ucans falls back to the covia:aggregate op', async () => {
    await ws.count('did:key:zAlice/w/x', { depth: 2, ucans: ['eyJ.proof'] });
    expect(venue.operations.run).toHaveBeenCalledWith('v/ops/covia/aggregate', { path: 'did:key:zAlice/w/x', depth: 2 }, { ucans: ['eyJ.proof'] });
  });
});
