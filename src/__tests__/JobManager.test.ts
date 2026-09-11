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
