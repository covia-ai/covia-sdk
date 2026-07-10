import { Venue } from '../Venue';
import { CoviaError, JobFailedError } from '../types';

// Private-jobs mode (covia #192): connection-level setPrivate(true) switches
// run() to the invoke wait-window flow (a completed private job is forgotten,
// so polling cannot collect it); invoke() fails loudly. Deterministic — the
// mocked invoke responds with a terminal record, so nothing polls or sleeps.

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function venueWith(response: any) {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(response) });
  const v = new Venue({ baseUrl: 'https://venue.example', venueId: 'did:key:zV', name: 't' });
  return v;
}

describe('private-jobs mode', () => {
  it('run() sends private+wait and returns the terminal output without polling', async () => {
    const v = venueWith({ id: 'j1', status: 'COMPLETE', output: { answer: 42 } });
    v.setPrivate(true);
    const out = await v.operations.run<any>('v/test/ops/echo', { x: 1 });
    expect(out.answer).toBe(42);
    expect(mockFetch).toHaveBeenCalledTimes(1);          // ONE request — no polling
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.private).toBe(true);
    expect(body.wait).toBe(true);
  });

  it('run() throws JobFailedError on a terminal failure', async () => {
    const v = venueWith({ id: 'j1', status: 'FAILED', output: { error: 'boom' } });
    v.setPrivate(true);
    await expect(v.operations.run('v/test/ops/fail', {})).rejects.toBeInstanceOf(JobFailedError);
  });

  it('invoke() under private mode fails loudly', async () => {
    const v = venueWith({});
    v.setPrivate(true);
    await expect(v.operations.invoke('v/test/ops/echo', {})).rejects.toBeInstanceOf(CoviaError);
    expect(mockFetch).not.toHaveBeenCalled();            // refused before any request
  });

  it('setPrivate(false) restores normal invoke', async () => {
    const v = venueWith({ id: 'j1', status: 'COMPLETE', output: {} });
    v.setPrivate(true);
    v.setPrivate(false);
    const job = await v.operations.invoke('v/test/ops/echo', {});
    expect(job.id).toBe('j1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.private).toBeUndefined();
  });
});

describe('ucan.verify', () => {
  it('calls v/ops/ucan/verify with token and check params', async () => {
    const v = venueWith({});
    const run = jest.fn().mockResolvedValue({ valid: true, authorises: true, att: [{ with: 'w/', can: 'crud/read', rootAuthority: 'owner' }] });
    (v as any)._operations = undefined;
    Object.defineProperty(v, 'operations', { value: { run, invoke: jest.fn() } });
    const r = await v.ucan.verify('jwt-here', { with: 'w/x', can: 'crud/read', aud: 'did:key:zBob' });
    expect(run).toHaveBeenCalledWith('v/ops/ucan/verify', { token: 'jwt-here', with: 'w/x', can: 'crud/read', aud: 'did:key:zBob' });
    expect(r.valid).toBe(true);
    expect(r.att?.[0].rootAuthority).toBe('owner');
  });
});
