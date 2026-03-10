import { Venue } from '../Venue';
import { CoviaError, RunStatus, AssetNotFoundError, JobNotFoundError, NotFoundError, GridError } from '../types';
import { CoviaUserAuth, BearerAuth, NoAuth } from '../Credentials';
import { Operation } from '../Operation';
import { DataAsset } from '../DataAsset';
import { Job } from '../Job';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock did-resolver
jest.mock('did-resolver', () => ({
  Resolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn().mockResolvedValue({
      didDocument: {
        service: [
          {
            type: 'Covia.API.v1',
            serviceEndpoint: 'https://resolved.example.com/api/v1',
          },
        ],
      },
    }),
  })),
}));

jest.mock('web-did-resolver', () => ({
  getResolver: jest.fn().mockReturnValue({}),
}));

function mockFetchSuccess(data: any) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    body: null,
  });
}

function mockFetchStreamSuccess(status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status,
    body: null,
  });
}

function mockFetchError(status: number) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
  });
}

describe('Venue constructor', () => {
  it('creates with default options', () => {
    const venue = new Venue();
    expect(venue.baseUrl).toBe('');
    expect(venue.venueId).toBe('');
    expect(venue.metadata.name).toBe('default');
    expect(venue.metadata.description).toBe('');
  });

  it('creates with provided options', () => {
    const venue = new Venue({
      baseUrl: 'https://test.com',
      venueId: 'did:web:test.com',
      name: 'Test Venue',
      description: 'A test venue',
    });
    expect(venue.baseUrl).toBe('https://test.com');
    expect(venue.venueId).toBe('did:web:test.com');
    expect(venue.metadata.name).toBe('Test Venue');
    expect(venue.metadata.description).toBe('A test venue');
  });

  it('uses NoAuth by default when no auth provided', () => {
    const venue = new Venue({ venueId: 'did:web:test.com' });
    expect(venue.auth).toBeInstanceOf(NoAuth);
  });

  it('uses provided auth', () => {
    const auth = new CoviaUserAuth('user@test.com');
    const venue = new Venue({ auth });
    expect(venue.auth).toBeInstanceOf(CoviaUserAuth);
  });
});

describe('Venue.connect', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('connects with HTTP URL', async () => {
    mockFetchSuccess({ did: 'did:web:test.com', name: 'Test' });

    const venue = await Venue.connect('https://test.com');
    expect(venue.baseUrl).toBe('https://test.com');
    expect(venue.venueId).toBe('did:web:test.com');
    expect(venue.metadata.name).toBe('Test');
  });

  it('strips trailing slash from URL', async () => {
    mockFetchSuccess({ did: 'did:web:test.com', name: 'Test' });

    const venue = await Venue.connect('https://test.com/');
    expect(venue.baseUrl).toBe('https://test.com');
  });

  it('connects with DNS name (adds https://)', async () => {
    mockFetchSuccess({ did: 'did:web:dns.example.com', name: 'DNS Venue' });

    const venue = await Venue.connect('dns.example.com');
    expect(venue.baseUrl).toBe('https://dns.example.com');
    expect(venue.metadata.name).toBe('DNS Venue');
  });

  it('connects with DID', async () => {
    mockFetchSuccess({ did: 'did:web:resolved.example.com', name: 'DID Venue' });

    const venue = await Venue.connect('did:web:resolved.example.com');
    expect(venue.baseUrl).toBe('https://resolved.example.com');
    expect(venue.venueId).toBe('did:web:resolved.example.com');
  });

  it('connects with existing Venue instance', async () => {
    const original = new Venue({
      baseUrl: 'https://original.com',
      venueId: 'did:web:original.com',
      name: 'Original',
    });

    const cloned = await Venue.connect(original);
    expect(cloned.baseUrl).toBe('https://original.com');
    expect(cloned.venueId).toBe('did:web:original.com');
    expect(cloned.metadata.name).toBe('Original');
  });

  it('passes auth when connecting with Venue instance', async () => {
    const original = new Venue({ baseUrl: 'https://x.com', venueId: 'v' });
    const auth = new CoviaUserAuth('user');

    const cloned = await Venue.connect(original, auth);
    expect(cloned.auth).toBeInstanceOf(CoviaUserAuth);
  });

  it('throws CoviaError on fetch failure during connect', async () => {
    mockFetchError(500);

    await expect(Venue.connect('https://bad.com')).rejects.toThrow(CoviaError);
  });
});

describe('Venue.getAsset', () => {
  let venue: Venue;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
  });

  it('returns Operation when metadata has operation field', async () => {
    mockFetchSuccess({ metadata: { name: 'Op', operation: { adapter: 'test' } } });

    const asset = await venue.getAsset('op-id');
    expect(asset).toBeInstanceOf(Operation);
    expect(asset.id).toBe('op-id');
  });

  it('returns DataAsset when metadata has no operation field', async () => {
    mockFetchSuccess({ metadata: { name: 'Data' } });

    const asset = await venue.getAsset('data-id');
    expect(asset).toBeInstanceOf(DataAsset);
    expect(asset.id).toBe('data-id');
  });

  it('throws AssetNotFoundError on 404', async () => {
    mockFetchError(404);
    await expect(venue.getAsset('missing-asset')).rejects.toThrow(AssetNotFoundError);
  });

  it('AssetNotFoundError is catchable as NotFoundError', async () => {
    mockFetchError(404);
    await expect(venue.getAsset('missing-asset')).rejects.toThrow(NotFoundError);
  });

  it('throws GridError (not AssetNotFoundError) on 500', async () => {
    mockFetchError(500);

    await expect(venue.getAsset('some-asset')).rejects.toThrow(GridError);
    try {
      mockFetchError(500);
      await venue.getAsset('some-asset-2');
    } catch (e) {
      expect(e).not.toBeInstanceOf(AssetNotFoundError);
    }
  });
});

describe('Venue.register', () => {
  let venue: Venue;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
  });

  it('registers asset via POST and returns it', async () => {
    // First fetch: register POST returns asset ID
    mockFetchSuccess('new-asset-id');
    // Second fetch: getAsset fetches the created asset
    mockFetchSuccess({ metadata: { name: 'New Asset' } });

    const asset = await venue.register({ name: 'New Asset' });
    expect(asset).toBeInstanceOf(DataAsset);

    // Verify POST was called
    expect(mockFetch.mock.calls[0][0]).toBe('https://test.com/api/v1/assets/');
    expect(mockFetch.mock.calls[0][1]?.method).toBe('POST');
  });
});

describe('Venue.listJobs and getJob', () => {
  let venue: Venue;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
  });

  it('listJobs returns array of job IDs', async () => {
    mockFetchSuccess(['job-1', 'job-2', 'job-3']);

    const jobs = await venue.listJobs();
    expect(jobs).toEqual(['job-1', 'job-2', 'job-3']);
  });

  it('getJob returns Job instance', async () => {
    mockFetchSuccess({ id: 'job-1', status: RunStatus.COMPLETE, input: {} });

    const job = await venue.getJob('job-1');
    expect(job).toBeInstanceOf(Job);
    expect(job.id).toBe('job-1');
  });

  it('getJob throws JobNotFoundError on 404', async () => {
    mockFetchError(404);

    await expect(venue.getJob('nonexistent')).rejects.toThrow(JobNotFoundError);
  });

  it('getJob 404 is catchable as NotFoundError and GridError', async () => {
    mockFetchError(404);
    await expect(venue.getJob('missing')).rejects.toThrow(NotFoundError);
    mockFetchError(404);
    await expect(venue.getJob('missing')).rejects.toThrow(GridError);
  });
});

describe('Venue.cancelJob and deleteJob', () => {
  let venue: Venue;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
  });

  it('cancelJob sends PUT and returns status', async () => {
    mockFetchStreamSuccess(200);

    const status = await venue.cancelJob('job-1');
    expect(status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.com/api/v1/jobs/job-1/cancel',
      { method: 'PUT' }
    );
  });

  it('deleteJob sends PUT and returns status', async () => {
    mockFetchStreamSuccess(200);

    const status = await venue.deleteJob('job-1');
    expect(status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.com/api/v1/jobs/job-1/delete',
      { method: 'PUT' }
    );
  });

  it('cancelJob throws JobNotFoundError on 404', async () => {
    mockFetchError(404);
    await expect(venue.cancelJob('missing')).rejects.toThrow(JobNotFoundError);
  });

  it('deleteJob throws JobNotFoundError on 404', async () => {
    mockFetchError(404);
    await expect(venue.deleteJob('missing')).rejects.toThrow(JobNotFoundError);
  });
});

describe('Venue.status', () => {
  it('returns status data', async () => {
    mockFetch.mockReset();
    const venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
    const statusData = { status: 'OK', url: 'https://test.com', did: 'did:web:test.com' };
    mockFetchSuccess(statusData);

    const stats = await venue.status();
    expect(stats.status).toBe('OK');
    expect(stats.url).toBe('https://test.com');
  });
});

describe('Venue.invoke and run', () => {
  let venue: Venue;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
  });

  it('invoke sends POST with operation payload and returns Job', async () => {
    mockFetchSuccess({ id: 'job-new', status: RunStatus.COMPLETE, output: { x: 1 } });

    const job = await venue.invoke('op-1', { param: 'val' });
    expect(job).toBeInstanceOf(Job);
    expect(job.id).toBe('job-new');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test.com/api/v1/invoke/');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.operation).toBe('op-1');
    expect(body.input).toEqual({ param: 'val' });
  });

  it('run sends POST and returns output', async () => {
    mockFetchSuccess({ output: { answer: 42 } });

    const result = await venue.run('op-2', { q: 'test' });
    expect(result).toEqual({ answer: 42 });
  });

  it('invoke throws CoviaError on failure', async () => {
    mockFetchError(500);

    await expect(venue.invoke('op-x', {})).rejects.toThrow(CoviaError);
  });

  it('run throws CoviaError on failure', async () => {
    mockFetchError(500);

    await expect(venue.run('op-x', {})).rejects.toThrow(CoviaError);
  });
});

describe('Venue auth headers', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('includes X-Covia-User header when CoviaUserAuth is used', async () => {
    const auth = new CoviaUserAuth('user@test.com');
    const venue = new Venue({ baseUrl: 'https://test.com', venueId: 'v', auth });
    mockFetchSuccess({ id: 'j1', status: 'COMPLETE' });

    await venue.invoke('op-1', {});

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Covia-User']).toBe('user@test.com');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes Authorization header when BearerAuth is used', async () => {
    const auth = new BearerAuth('my-token');
    const venue = new Venue({ baseUrl: 'https://test.com', venueId: 'v', auth });
    mockFetchSuccess({ id: 'j1', status: 'COMPLETE' });

    await venue.invoke('op-1', {});

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer my-token');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends no auth headers when NoAuth is used', async () => {
    const venue = new Venue({ baseUrl: 'https://test.com', venueId: 'v' });
    mockFetchSuccess({ id: 'j1', status: 'COMPLETE' });

    await venue.invoke('op-1', {});

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Covia-User']).toBeUndefined();
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });
});

describe('Venue.listAssets', () => {
  it('returns paginated asset list', async () => {
    mockFetch.mockReset();
    const venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });

    mockFetchSuccess({ items: ['a1', 'a2'], total: 2, offset: 0, limit: 100 });

    const result = await venue.listAssets();
    expect(result.items).toEqual(['a1', 'a2']);
    expect(result.total).toBe(2);
  });
});

describe('Venue.putContent and getContent', () => {
  let venue: Venue;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = new Venue({
      baseUrl: 'https://test.com',
      venueId: 'did:web:test.com',
      auth: new CoviaUserAuth('user'),
    });
  });

  it('putContent sends PUT with content', async () => {
    mockFetchStreamSuccess(200);

    await venue.putContent('asset-1', 'file-data');
    expect(mockFetch.mock.calls[0][0]).toBe('https://test.com/api/v1/assets/asset-1/content');
    expect(mockFetch.mock.calls[0][1]?.method).toBe('PUT');
  });

  it('getContent sends GET for content', async () => {
    mockFetchStreamSuccess(200);

    await venue.getContent('asset-1');
    expect(mockFetch.mock.calls[0][0]).toBe('https://test.com/api/v1/assets/asset-1/content');
  });

  it('putContent throws AssetNotFoundError on 404', async () => {
    mockFetchError(404);
    await expect(venue.putContent('missing', 'data')).rejects.toThrow(AssetNotFoundError);
  });

  it('getContent throws AssetNotFoundError on 404', async () => {
    mockFetchError(404);
    await expect(venue.getContent('missing')).rejects.toThrow(AssetNotFoundError);
  });
});

describe('Venue.getMetadata', () => {
  let venue: Venue;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
  });

  it('throws AssetNotFoundError on 404', async () => {
    mockFetchError(404);
    await expect(venue.getMetadata('missing')).rejects.toThrow(AssetNotFoundError);
  });
});

describe('Venue.close', () => {
  it('can be called without error', () => {
    const venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
    expect(() => venue.close()).not.toThrow();
  });

  it('supports Symbol.dispose', () => {
    const venue = new Venue({ baseUrl: 'https://test.com', venueId: 'did:web:test.com' });
    expect(venue[Symbol.dispose]).toBeDefined();
    expect(() => venue[Symbol.dispose]()).not.toThrow();
  });
});
