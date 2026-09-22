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

  // ── no version fast-path (#36): the route's own answer decides, never the
  // venue's self-reported version — an embedded venue can report its host
  // application's version instead of its own, and trusting that would
  // permanently refuse a route that actually works fine. ─────────────────

  it('a status without a version does not block the probe', async () => {
    (venue as any).lastKnownStatus = { name: 'Old Stable', did: 'did:key:zVenue' }; // no version field
    okJson({ exists: true, value: 1 });
    await ws.read('w/mydata');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('a status reporting a low/wrong version does not block the probe either', async () => {
    // e.g. an embedded venue's Engine.jarVersion() reading the host
    // application's Implementation-Version out of a shaded jar manifest.
    (venue as any).lastKnownStatus = { version: '0.1.0-SNAPSHOT' };
    okJson({ exists: true, value: 1 });
    await ws.read('w/mydata');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('a version arriving after a working first read does not retroactively downgrade it', async () => {
    okJson({ exists: true, value: 1 });
    await ws.read('w/first');
    (venue as any).lastKnownStatus = { version: '0.1.0' };          // e.g. venue.status() resolved
    okJson({ exists: true, value: 2 });
    await ws.read('w/second');
    expect(mockFetch).toHaveBeenCalledTimes(2);
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

// ── execution-scoped scratch reads (covia-sdk#17 / covia#230) ────────────────

describe('WorkspaceManager scoped scratch', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let ws: WorkspaceManager;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = createMockVenue();
    ws = new WorkspaceManager(venue);
  });

  /** A venue that rejects the shorthand — how a pre-#230 venue answers. */
  function unexpandedShorthand() {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 400,
      text: () => Promise.resolve("Cannot use 't/' prefix outside job or task scope"),
    });
  }

  it('sends agent+task selectors for a t/ read, and no session', async () => {
    okJson({ exists: true, value: 'snap' });
    const scratch = ws.scoped({ agent: 'alice', task: '0x019f', session: 'abcd' });
    const r = await scratch.read('t/snapshot');

    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/read');
    expect(u.searchParams.get('path')).toBe('t/snapshot');
    expect(u.searchParams.get('agent')).toBe('alice');
    expect(u.searchParams.get('task')).toBe('0x019f');
    // The venue 400s a selector its namespace does not consume, so a handle
    // carrying all three must still send only the two t/ uses.
    expect(u.searchParams.get('session')).toBeNull();
    expect(venue.operations.run).not.toHaveBeenCalled();             // still job-free
    expect(r.value).toBe('snap');
  });

  it('sends agent+session for c/ and agent alone for n/', async () => {
    okJson({ exists: true, type: 'Map', count: 0, keys: [] });
    await ws.scoped({ agent: 'alice', session: 'sid1', task: 't1' }).list('c/');
    let u = new URL(fetchUrl(0));
    expect(u.searchParams.get('session')).toBe('sid1');
    expect(u.searchParams.get('task')).toBeNull();

    okJson({ exists: true, value: 1 });
    await ws.scoped({ agent: 'alice', session: 'sid1', task: 't1' }).read('n/persona');
    u = new URL(fetchUrl(1));
    expect(u.searchParams.get('agent')).toBe('alice');
    expect(u.searchParams.get('session')).toBeNull();
    expect(u.searchParams.get('task')).toBeNull();
  });

  it('rejects a c/ read with no session in scope, before any request', async () => {
    await expect(ws.scoped({ agent: 'alice' }).read('c/notes')).rejects.toThrow(/needs a session/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a t/ read with no task in scope, before any request', async () => {
    await expect(ws.scoped({ agent: 'alice' }).read('t/x')).rejects.toThrow(/needs a task/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('passes an ordinary path through unscoped — selectors would 400', async () => {
    okJson({ exists: true, value: 7 });
    await ws.scoped({ agent: 'alice', task: 't1' }).read('w/mydata');
    const u = new URL(fetchUrl());
    expect(u.searchParams.get('path')).toBe('w/mydata');
    expect(u.searchParams.get('agent')).toBeNull();
  });

  it('falls back to client-side expansion on a venue without #230, and latches', async () => {
    unexpandedShorthand();
    okJson({ exists: true, value: 'snap' });
    const scratch = ws.scoped({ agent: 'alice', task: '019f' });
    const r = await scratch.read('t/snapshot');
    expect(r.value).toBe('snap');

    // Retry targets the physical Job record, per TempNamespaceResolver.
    const retry = new URL(fetchUrl(1));
    expect(retry.searchParams.get('path')).toBe('j/019f/temp/snapshot');
    expect(retry.searchParams.get('agent')).toBeNull();

    // Latched: the next scoped read expands directly, no second probe.
    okJson({ exists: true, value: 2 });
    await scratch.read('t/other');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(new URL(fetchUrl(2)).searchParams.get('path')).toBe('j/019f/temp/other');
  });

  it('expands c/ and n/ to their documented physical paths on fallback', async () => {
    unexpandedShorthand();
    okJson({ exists: true, value: 1 });
    await ws.scoped({ agent: 'alice', session: 'sid1' }).read('c/draft/notes');
    expect(new URL(fetchUrl(1)).searchParams.get('path'))
      .toBe('g/alice/sessions/sid1/c/draft/notes');

    okJson({ exists: true, value: 1 });
    await ws.scoped({ agent: 'alice' }).read('n/persona');
    expect(new URL(fetchUrl(2)).searchParams.get('path')).toBe('g/alice/n/persona');
  });

  it('expands a bare prefix with no suffix', async () => {
    unexpandedShorthand();
    okJson({ exists: true, type: 'Map', count: 0, keys: [] });
    await ws.scoped({ agent: 'alice', task: '019f' }).list('t/');
    expect(new URL(fetchUrl(1)).searchParams.get('path')).toBe('j/019f/temp/');
  });

  it('propagates an unrelated error instead of latching the fallback on', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 403, text: () => Promise.resolve('No read capability for g/alice'),
    });
    const scratch = ws.scoped({ agent: 'alice', task: '019f' });
    await expect(scratch.read('t/snapshot')).rejects.toThrow(/No read capability/);
    expect(mockFetch).toHaveBeenCalledTimes(1);                      // no silent retry

    // Not latched — the venue is still trusted to expand.
    okJson({ exists: true, value: 1 });
    await scratch.read('t/snapshot');
    expect(new URL(fetchUrl(1)).searchParams.get('agent')).toBe('alice');
  });

  it('refuses to expand a DID-qualified agent client-side', async () => {
    unexpandedShorthand();
    await expect(
      ws.scoped({ agent: 'did:key:zAlice', task: '019f' }).read('t/x'),
    ).rejects.toThrow(/cannot do it for a DID-qualified agent/);
  });

  it('scopes every job-free read verb', async () => {
    const scope = { agent: 'alice', task: '019f', session: 'sid1' };
    okJson({ exists: true, count: 3 });
    await ws.scoped(scope).count('t/results');
    expect(new URL(fetchUrl(0)).pathname).toBe('/api/v1/values/count');

    okJson({ exists: true, values: [], count: 0 });
    await ws.scoped(scope).slice('t/results', 0, 10);
    expect(new URL(fetchUrl(1)).pathname).toBe('/api/v1/values/slice');

    okJson({ exists: true, groups: {} });
    await ws.scoped(scope).aggregate('c/topics', { groupBy: 'kind' });
    const agg = new URL(fetchUrl(2));
    expect(agg.pathname).toBe('/api/v1/values/aggregate');
    expect(agg.searchParams.get('groupBy')).toBe('kind');
    expect(agg.searchParams.get('session')).toBe('sid1');

    okJson({ exists: true });
    await ws.scoped(scope).inspect('n/memory');
    expect(new URL(fetchUrl(3)).pathname).toBe('/api/v1/values/inspect');
  });
});

// ── field projection on list (covia#191 / covia-sdk#12) ──────────────────────

describe('WorkspaceManager.listFields', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let ws: WorkspaceManager;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = createMockVenue();
    ws = new WorkspaceManager(venue);
  });

  it('asks for the projection in one job-free GET and returns its values', async () => {
    okJson({
      exists: true, type: 'Index', count: 2, keys: ['j1', 'j2'],
      values: {
        j1: { status: { exists: true, value: 'COMPLETE' }, 'meta/updated': { exists: true, value: 7 } },
        j2: { status: { exists: true, value: 'FAILED' }, 'meta/updated': { exists: false } },
      },
    });

    const page = await ws.listFields('j', ['status', 'meta/updated'], { limit: 50 });

    expect(venue.operations.run).not.toHaveBeenCalled();     // job-free
    expect(mockFetch).toHaveBeenCalledTimes(1);              // no N+1
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/list');
    expect(u.searchParams.get('path')).toBe('j');
    expect(u.searchParams.get('fields')).toBe('status,meta/updated');
    expect(u.searchParams.get('limit')).toBe('50');
    expect(page.values.j1.status).toEqual({ exists: true, value: 'COMPLETE' });
    expect(page.values.j2['meta/updated']).toEqual({ exists: false });
  });

  it('refuses more than the venue cap of 16 fields before any request', async () => {
    const fields = Array.from({ length: 17 }, (_, i) => `f${i}`);
    await expect(ws.listFields('j', fields)).rejects.toThrow(/at most 16/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses an empty field list', async () => {
    await expect(ws.listFields('j', [])).rejects.toThrow(/at least one field/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // A venue predating covia#191 ignores the unknown param and answers a plain
  // list — the documented probe. Detection must be that, never a version check.
  it('falls back to list + per-field reads on a venue without projection', async () => {
    okJson({ exists: true, type: 'Index', count: 2, keys: ['j1', 'j2'] }); // probe: no values
    okJson({ exists: true, type: 'Index', count: 2, keys: ['j1', 'j2'] }); // fallback list
    okJson({ exists: true, value: 'COMPLETE' });                            // j1/status
    okJson({ exists: false });                                             // j2/status

    const page = await ws.listFields('j', ['status']);

    expect(page.values).toEqual({
      j1: { status: { exists: true, value: 'COMPLETE' } },
      j2: { status: { exists: false } },
    });
    expect(page.keys).toEqual(['j1', 'j2']);
    const readUrls = mockFetch.mock.calls.slice(2).map((c) => new URL(String(c[0])));
    expect(readUrls.map((u) => u.pathname)).toEqual(['/api/v1/values/read', '/api/v1/values/read']);
    expect(readUrls.map((u) => u.searchParams.get('path'))).toEqual(['j/j1/status', 'j/j2/status']);
  });

  it('latches the fallback, so a second call does not re-probe', async () => {
    okJson({ exists: true, keys: ['j1'], type: 'Index' }); // probe
    okJson({ exists: true, keys: ['j1'], type: 'Index' }); // fallback list
    okJson({ exists: true, value: 'A' });
    await ws.listFields('j', ['status']);
    const afterFirst = mockFetch.mock.calls.length;

    okJson({ exists: true, keys: ['j1'], type: 'Index' }); // straight to the fallback list
    okJson({ exists: true, value: 'B' });
    await ws.listFields('j', ['status']);

    // 2 calls, not 3 — no projection attempt the second time round.
    expect(mockFetch.mock.calls.length - afterFirst).toBe(2);
    expect(mockFetch.mock.calls.slice(afterFirst).every(
      (c) => !new URL(String(c[0])).searchParams.has('fields'),
    )).toBe(true);
  });

  it('drops the single-read extras so both paths look identical to the caller', async () => {
    okJson({ exists: true, keys: ['j1'], type: 'Index' });
    okJson({ exists: true, keys: ['j1'], type: 'Index' });
    // A real `read` also carries type/valueBytes; a projected field never does.
    okJson({ exists: true, value: 'x', type: 'String', valueBytes: 3, truncated: true });

    const page = await ws.listFields('j', ['status']);
    expect(page.values.j1.status).toEqual({ exists: true, value: 'x', truncated: true });
  });

  // An absent or non-keyed node never projects — that is not evidence the
  // venue lacks the feature, so it must not latch the fallback on.
  it('returns an empty projection for an absent path without latching', async () => {
    okJson({ exists: false, type: 'Nil' });
    const page = await ws.listFields('j/missing', ['status']);
    expect(page.values).toEqual({});
    expect(mockFetch).toHaveBeenCalledTimes(1);

    okJson({ exists: true, keys: ['j1'], type: 'Index', values: { j1: { status: { exists: true, value: 'S' } } } });
    await ws.listFields('j', ['status']);
    expect(new URL(fetchUrl(1)).searchParams.get('fields')).toBe('status'); // still projecting
  });
});
