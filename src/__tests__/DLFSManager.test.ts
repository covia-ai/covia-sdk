import { DLFSManager } from '../DLFSManager';
import { UnsupportedVenueFeatureError } from '../types';

// listDrives/list are job-free GETs to /api/v1/dlfs/* (covia #253);
// getContent is a job-free streamed GET to /api/v1/content/dlfs/<drive>/<path>
// (the venue's generic asset-content route, since DLFSAdapter implements
// ContentProvider) — never JSON/base64-wrapped. Fetch is mocked throughout.
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function createMockVenue() {
  return {
    baseUrl: 'https://venue.example',
    venueId: 'did:key:zVenue',
    auth: { apply: jest.fn((h: Record<string, string>) => { h['Authorization'] = 'Bearer tok'; }) },
  };
}

function okJson(data: any) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

function okStream(body: unknown = {}) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });
}

function errJson(status: number, message: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false, status,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(message),
  });
}

describe('DLFSManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let dlfs: DLFSManager;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = createMockVenue();
    dlfs = new DLFSManager(venue);
  });

  it('listDrives GETs /api/v1/dlfs/drives and binds auth', async () => {
    okJson({ drives: ['vault', 'notes'] });
    const r = await dlfs.listDrives();
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/dlfs/drives');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(r).toEqual({ drives: ['vault', 'notes'] });
  });

  it('list GETs /api/v1/dlfs/list with drive and path query params', async () => {
    okJson({ entries: [{ name: 'note.txt', type: 'file', size: 5 }] });
    await dlfs.list('vault', 'docs');
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/dlfs/list');
    expect(u.searchParams.get('drive')).toBe('vault');
    expect(u.searchParams.get('path')).toBe('docs');
  });

  it('list omits the path param when browsing the drive root', async () => {
    okJson({ entries: [] });
    await dlfs.list('vault');
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.searchParams.has('path')).toBe(false);
  });

  it('a 403 propagates untouched, not swallowed as unsupported', async () => {
    errJson(403, 'Capability denied: requires crud/read on dlfs/vault/secret.txt');
    const err = await dlfs.list('vault', 'secret.txt').catch((e) => e);
    expect(err).not.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(String(err.message)).toContain('Capability denied');
  });

  it('rejects without further probing and latches on a route-missing 404', async () => {
    errJson(404, 'Endpoint GET /api/v1/dlfs/drives not found');
    await expect(dlfs.listDrives()).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    // Subsequent calls skip the probe entirely.
    await expect(dlfs.list('vault')).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('a per-resource 404 (unknown drive) propagates — no latch', async () => {
    errJson(404, 'Drive not found: ghost');
    await expect(dlfs.list('ghost')).rejects.toThrow('Drive not found: ghost');

    // The GET surface stays trusted: the next call still goes job-free.
    okJson({ drives: [] });
    await dlfs.listDrives();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('getContent GETs /api/v1/content/dlfs/<drive>/<path> and returns the raw body', async () => {
    const fakeBody = { locked: true };
    okStream(fakeBody);
    const body = await dlfs.getContent('vault', 'docs/note.txt');
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/content/dlfs/vault/docs/note.txt');
    expect(body).toBe(fakeBody);
  });

  it('getContent percent-encodes drive and path segments', async () => {
    okStream();
    await dlfs.getContent('my drive', 'a b/c.txt');
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/content/dlfs/my%20drive/a%20b/c.txt');
  });
});
