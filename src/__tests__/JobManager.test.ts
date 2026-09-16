import { JobManager } from '../JobManager';

// jobs.list is a job-free GET to /api/v1/jobs. Venue 0.6.0 returns a paged
// {items, total, offset, limit} envelope (covia#229); earlier venues return a
// flat id array. The SDK accepts both so one client spans the upgrade.
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function createMockVenue() {
  return {
    baseUrl: 'https://venue.example',
    auth: { apply: jest.fn((h: Record<string, string>) => { h['Authorization'] = 'Bearer tok'; }) },
  };
}

function okJson(data: any) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

describe('JobManager.list', () => {
  let jobs: JobManager;

  beforeEach(() => {
    mockFetch.mockReset();
    jobs = new JobManager(createMockVenue() as any);
  });

  it('parses the 0.6.0 paged envelope', async () => {
    okJson({ items: ['0a1b', '0c2d'], total: 2, offset: 0, limit: 1000 });
    expect(await jobs.list()).toEqual(['0a1b', '0c2d']);
  });

  it('fetches every page before returning the list', async () => {
    okJson({ items: ['0a1b', '0c2d'], total: 3, offset: 0, limit: 2 });
    okJson({ items: ['0e3f'], total: 3, offset: 2, limit: 2 });

    expect(await jobs.list()).toEqual(['0a1b', '0c2d', '0e3f']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const first = new URL(String(mockFetch.mock.calls[0][0]));
    const second = new URL(String(mockFetch.mock.calls[1][0]));
    expect(first.searchParams.get('offset')).toBe('0');
    expect(first.searchParams.get('limit')).toBe('1000');
    expect(second.searchParams.get('offset')).toBe('2');
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
  });

  it('parses the legacy flat id array', async () => {
    okJson(['0a1b', '0c2d']);
    expect(await jobs.list()).toEqual(['0a1b', '0c2d']);
  });

  it('returns empty for an empty envelope', async () => {
    okJson({ items: [], total: 0, offset: 0, limit: 1000 });
    expect(await jobs.list()).toEqual([]);
  });

  it('rejects malformed pages instead of presenting them as an empty list', async () => {
    okJson({ items: ['0a1b'] });
    await expect(jobs.list()).rejects.toThrow('invalid jobs page');
  });
});

/** Body for a mocked streaming Response — one text/event-stream chunk. */
function mockSSEBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('JobManager.stream', () => {
  let jobs: JobManager;

  beforeEach(() => {
    mockFetch.mockReset();
    jobs = new JobManager(createMockVenue() as any);
  });

  it('forwards the signal and parses SSE events (covia-sdk#30)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: mockSSEBody(['event: status\ndata: {"s":"A"}\n\n']),
    });
    const controller = new AbortController();

    const events: unknown[] = [];
    for await (const evt of jobs.stream('j1', { signal: controller.signal })) {
      events.push(evt.json());
    }

    expect(events).toEqual([{ s: 'A' }]);
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/jobs/j1/sse');
    expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });
});

// Job records carry `op` (the reference that was invoked) and `parent` (the
// nearest recorded ancestor job). The venue has always emitted the former as
// `op`; the SDK previously declared a never-populated `operation` instead
// (covia#499, covia#500, covia-sdk#54).
describe('JobManager.get — op and parent (covia-sdk#54)', () => {
  let jobs: JobManager;

  beforeEach(() => {
    mockFetch.mockReset();
    jobs = new JobManager(createMockVenue() as any);
  });

  it('exposes op as the invoked reference and parent as the ancestor id', async () => {
    okJson({ id: 'j2', status: 'COMPLETE', op: 'v/ops/json/merge', parent: '0a1b' });

    const job = await jobs.get('j2');

    const op: string | undefined = job.metadata.op;
    const parent: string | undefined = job.metadata.parent;
    expect(op).toBe('v/ops/json/merge');
    expect(parent).toBe('0a1b');
  });

  it('accepts a hash in op — pinned invocations and pre-0.9.9 records', async () => {
    const hash = '0f'.repeat(32);
    okJson({ id: 'j3', status: 'COMPLETE', op: hash });

    const job = await jobs.get('j3');

    expect(job.metadata.op).toBe(hash);
    expect(job.metadata.parent).toBeUndefined();
  });
});

// ── jobs.history (covia-sdk#21) ─────────────────────────────────────────────
//
// History reads the job index through the job-free Values surface, so each row
// arrives with its metadata attached rather than costing an extra jobs.get().
// The workspace reader is mocked directly: what matters here is the windowing,
// the ordering and the recovery behaviour, not the HTTP shape of a slice.

describe('JobManager.history', () => {
  /** A job index of `n` records, ascending/chronological like the venue's. */
  function index(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      key: `k${i}`,
      value: { status: 'COMPLETE', created: `2026-01-${String(i + 1).padStart(2, '0')}` },
    }));
  }

  function createWorkspaceVenue(entries: any[], overrides: any = {}) {
    const slice = jest.fn(async (path: string, offset = 0, limit = 100) => ({
      exists: true,
      values: entries.slice(offset, offset + limit),
      count: entries.length,
      offset,
    }));
    const count = jest.fn(async () => ({ exists: true, count: entries.length }));
    return {
      baseUrl: 'https://venue.example',
      auth: { apply: jest.fn() },
      workspace: { slice, count, ...overrides },
    };
  }

  beforeEach(() => mockFetch.mockReset());

  it('returns newest-first by default, with the authoritative total', async () => {
    const venue = createWorkspaceVenue(index(5));
    const page = await new JobManager(venue as any).history();

    expect(page.total).toBe(5);
    expect(page.offset).toBe(0);
    expect(page.items.map((j) => j.created)).toEqual([
      '2026-01-05', '2026-01-04', '2026-01-03', '2026-01-02', '2026-01-01',
    ]);
    expect(venue.workspace.slice).toHaveBeenCalledWith('j', 0, 5);
    expect(mockFetch).not.toHaveBeenCalled();                    // job-free: no /api/v1/jobs
  });

  it('places a desc window by counting back from the newest record', async () => {
    const venue = createWorkspaceVenue(index(10));
    const page = await new JobManager(venue as any).history({ offset: 2, limit: 3 });

    // desc [2,5) over 10 records is ascending [5,8), reversed.
    expect(venue.workspace.slice).toHaveBeenCalledWith('j', 5, 3);
    expect(page.items.map((j) => j.created)).toEqual(['2026-01-08', '2026-01-07', '2026-01-06']);
    expect(page.total).toBe(10);
  });

  it('reads asc as the index order, with no preliminary count', async () => {
    const venue = createWorkspaceVenue(index(10));
    const page = await new JobManager(venue as any).history({ offset: 2, limit: 3, order: 'asc' });

    expect(venue.workspace.count).not.toHaveBeenCalled();         // one read, not two
    expect(venue.workspace.slice).toHaveBeenCalledWith('j', 2, 3);
    expect(page.items.map((j) => j.created)).toEqual(['2026-01-03', '2026-01-04', '2026-01-05']);
    expect(page.total).toBe(10);
  });

  it('clamps a desc window that runs off the start of the index', async () => {
    const venue = createWorkspaceVenue(index(3));
    const page = await new JobManager(venue as any).history({ offset: 1, limit: 10 });

    expect(venue.workspace.slice).toHaveBeenCalledWith('j', 0, 2);
    expect(page.items).toHaveLength(2);
  });

  it('returns an empty page when the offset is past the end', async () => {
    const venue = createWorkspaceVenue(index(3));
    const page = await new JobManager(venue as any).history({ offset: 99, limit: 10 });

    expect(page.items).toEqual([]);
    expect(page.total).toBe(3);
    expect(venue.workspace.slice).not.toHaveBeenCalled();         // nothing to read
  });

  it('re-places the window once when the index grew between count and slice', async () => {
    const entries = index(10);
    const venue = createWorkspaceVenue(entries);
    // The tally is a snapshot; two jobs land before the slice is served.
    venue.workspace.count = jest.fn(async () => ({ exists: true, count: 8 })) as any;

    const page = await new JobManager(venue as any).history({ limit: 2 });

    // Stale total 8 → ascending [6,8); the slice reports 10, so re-read [8,10).
    expect(venue.workspace.slice).toHaveBeenNthCalledWith(1, 'j', 6, 2);
    expect(venue.workspace.slice).toHaveBeenNthCalledWith(2, 'j', 8, 2);
    expect(page.total).toBe(10);
    expect(page.items.map((j) => j.created)).toEqual(['2026-01-10', '2026-01-09']);
  });

  it('identifies a record with no id in its body from the index key', async () => {
    const venue = createWorkspaceVenue([{ key: 'deadbeef', value: { status: 'COMPLETE' } }]);
    const page = await new JobManager(venue as any).history();
    expect(page.items[0].id).toBe('0xdeadbeef');                  // hex key → API id form
  });

  it('prefers an id carried in the record body', async () => {
    const venue = createWorkspaceVenue([{ key: 'deadbeef', value: { id: '0xfeed', status: 'COMPLETE' } }]);
    const page = await new JobManager(venue as any).history();
    expect(page.items[0].id).toBe('0xfeed');
  });

  it('skips a malformed entry rather than emitting a blank row', async () => {
    const venue = createWorkspaceVenue([
      { key: 'a', value: { status: 'COMPLETE' } },
      { key: 'b' },                                               // no value
      'nonsense',
    ]);
    const page = await new JobManager(venue as any).history({ order: 'asc' });
    expect(page.items).toHaveLength(1);
  });

  it('halves the chunk when a window of fat jobs trips the response cap', async () => {
    const entries = index(120);
    const venue = createWorkspaceVenue(entries);
    const real = venue.workspace.slice;
    venue.workspace.slice = jest.fn(async (path: string, offset = 0, limit = 100) => {
      if (limit > 50) throw new Error('Value exceeds maxSize of 1000000 bytes');
      return real(path, offset, limit);
    }) as any;

    const page = await new JobManager(venue as any).history({ offset: 0, limit: 100 });

    expect(page.items).toHaveLength(100);
    expect(page.items[0].created).toBe('2026-01-120');            // still newest-first
    const limits = (venue.workspace.slice as jest.Mock).mock.calls.map((c) => c[2]);
    expect(limits).toContain(100);                                // tried the full window
    expect(limits).toContain(50);                                 // then halved
  });

  it('skips a single record that is oversize on its own', async () => {
    const entries = index(5);
    const venue = createWorkspaceVenue(entries);
    const real = venue.workspace.slice;
    venue.workspace.slice = jest.fn(async (path: string, offset = 0, limit = 100) => {
      if (offset <= 2 && offset + limit > 2) throw new Error('Value exceeds maxSize');
      return real(path, offset, limit);
    }) as any;

    const page = await new JobManager(venue as any).history({ order: 'asc', limit: 5 });

    // Four rows, not a failed read: the one fat job degrades the window by a row.
    expect(page.items.map((j) => j.created)).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-04', '2026-01-05',
    ]);
  });

  it('propagates a non-cap slice error', async () => {
    const venue = createWorkspaceVenue(index(5));
    venue.workspace.slice = jest.fn(async () => { throw new Error('No read capability for j'); }) as any;
    await expect(new JobManager(venue as any).history()).rejects.toThrow(/No read capability/);
  });

  it('answers a zero limit with the total alone', async () => {
    const venue = createWorkspaceVenue(index(7));
    const page = await new JobManager(venue as any).history({ limit: 0 });
    expect(page).toEqual({ items: [], total: 7, offset: 0, limit: 0 });
    expect(venue.workspace.slice).not.toHaveBeenCalled();
  });
});
