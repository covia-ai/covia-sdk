import { UserManager } from '../UserManager';
import { GridError, UnsupportedVenueFeatureError } from '../types';

// list/info/listAuthenticators are job-free GETs to /api/v1/users (covia
// #255); revokeAuthenticator is a mutation and stays on the invoke/job path.
// Fetch is mocked for the GET surface, operations.run for the mutation. A
// 403 (signed in, not an operator) must propagate untouched — it is the
// frontend's operator-detection signal, never swallowed as "unsupported".
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

function errJson(status: number, message: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false, status,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(message),
  });
}

describe('UserManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let users: UserManager;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = createMockVenue();
    users = new UserManager(venue);
  });

  it('list GETs /api/v1/users (no job) and binds auth', async () => {
    okJson({ users: [{ did: 'did:key:z1', registered: true }], total: 1 });
    const r = await users.list();
    expect(venue.operations.run).not.toHaveBeenCalled();
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/users');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(r).toEqual({ users: [{ did: 'did:key:z1', registered: true }], total: 1 });
  });

  it('list propagates a 403 untouched — the operator-detection signal, not swallowed', async () => {
    errJson(403, 'Venue administration denied: requires user/read on did:key:zVenue/users');
    const err = await users.list().catch((e) => e);
    expect(err).toBeInstanceOf(GridError);
    expect((err as GridError).statusCode).toBe(403);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('list rejects without invoking and latches on a route-missing 404', async () => {
    errJson(404, 'Endpoint GET /api/v1/users not found');
    await expect(users.list()).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(venue.operations.run).not.toHaveBeenCalled();
    // Subsequent calls skip the probe entirely.
    await expect(users.info('did:key:z1')).rejects.toBeInstanceOf(UnsupportedVenueFeatureError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('info on a user that just is not registered propagates the 404 — no latch', async () => {
    // Regression (mirrors AgentManager, covia#180): a per-resource 404 must
    // never be read as "venue lacks the route", or a real 404 permanently
    // downgrades every later read to UnsupportedVenueFeatureError.
    errJson(404, 'User is not registered at this venue: did:key:zghost');
    await expect(users.info('did:key:zghost')).rejects.toThrow('User is not registered at this venue');

    // The GET surface stays trusted: the next list still goes job-free.
    okJson({ users: [], total: 0 });
    await users.list();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(venue.operations.run).not.toHaveBeenCalled();
  });

  it('info GETs /api/v1/users/{did}', async () => {
    okJson({ did: 'did:key:z1', registered: true, managed: false });
    const r = await users.info('did:key:z1');
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/users/did%3Akey%3Az1');
    expect(r.managed).toBe(false);
  });

  it('listAuthenticators GETs /api/v1/users/{did}/authentications', async () => {
    okJson({
      did: 'did:key:z1',
      authenticationKeys: {
        'did:key:zAuth1': { status: 'active', addedAt: 1000, addedBy: 'did:key:zVenue' },
      },
    });
    const r = await users.listAuthenticators('did:key:z1');
    const u = new URL(String(mockFetch.mock.calls[0][0]));
    expect(u.pathname).toBe('/api/v1/users/did%3Akey%3Az1/authentications');
    expect(r.authenticationKeys['did:key:zAuth1'].status).toBe('active');
  });

  it('revokeAuthenticator calls v/ops/user/authentication-revoke, not a GET', async () => {
    await users.revokeAuthenticator('did:key:zAuth1', 'did:key:z1', ['ucan-jwt']);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(venue.operations.run).toHaveBeenCalledWith(
      'v/ops/user/authentication-revoke',
      { did: 'did:key:z1', key: 'did:key:zAuth1' },
      { ucans: ['ucan-jwt'] },
    );
  });
});
