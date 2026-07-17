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

  it('parses the legacy flat id array', async () => {
    okJson(['0a1b', '0c2d']);
    expect(await jobs.list()).toEqual(['0a1b', '0c2d']);
  });

  it('returns empty for an empty envelope', async () => {
    okJson({ items: [], total: 0, offset: 0, limit: 1000 });
    expect(await jobs.list()).toEqual([]);
  });
});
