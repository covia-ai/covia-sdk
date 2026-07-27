import { RunStatus, CoviaError, GridError, NotFoundError, CoviaConnectionError } from '../types';
import {
  isJobComplete,
  isJobFinished,
  isJobPaused,
  getParsedAssetId,
  getAssetIdFromPath,
  getAssetIdFromVenueId,
  fetchWithError,
  fetchStreamWithError,
} from '../Utils';

// ── isJobComplete ──────────────────────────────────────────────────────
describe('isJobComplete', () => {
  it('returns true for COMPLETE', () => {
    expect(isJobComplete(RunStatus.COMPLETE)).toBe(true);
  });

  it.each([
    RunStatus.FAILED,
    RunStatus.PENDING,
    RunStatus.STARTED,
    RunStatus.CANCELLED,
    RunStatus.TIMEOUT,
    RunStatus.REJECTED,
    RunStatus.INPUT_REQUIRED,
    RunStatus.AUTH_REQUIRED,
    RunStatus.PAUSED,
  ])('returns false for %s', (status) => {
    expect(isJobComplete(status)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isJobComplete(null as unknown as RunStatus)).toBe(false);
  });
});

// ── isJobFinished ──────────────────────────────────────────────────────
describe('isJobFinished', () => {
  it.each([
    RunStatus.COMPLETE,
    RunStatus.FAILED,
    RunStatus.REJECTED,
    RunStatus.CANCELLED,
    RunStatus.TIMEOUT,
  ])('returns true for %s', (status) => {
    expect(isJobFinished(status)).toBe(true);
  });

  it.each([
    RunStatus.PENDING,
    RunStatus.STARTED,
    RunStatus.INPUT_REQUIRED,
    RunStatus.AUTH_REQUIRED,
    RunStatus.PAUSED,
  ])('returns false for %s', (status) => {
    expect(isJobFinished(status)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isJobFinished(null as unknown as RunStatus)).toBe(false);
  });
});

// ── isJobPaused ────────────────────────────────────────────────────────
describe('isJobPaused', () => {
  it.each([
    RunStatus.PAUSED,
    RunStatus.INPUT_REQUIRED,
    RunStatus.AUTH_REQUIRED,
  ])('returns true for %s', (status) => {
    expect(isJobPaused(status)).toBe(true);
  });

  it.each([
    RunStatus.COMPLETE,
    RunStatus.FAILED,
    RunStatus.PENDING,
    RunStatus.STARTED,
    RunStatus.CANCELLED,
    RunStatus.TIMEOUT,
    RunStatus.REJECTED,
  ])('returns false for %s', (status) => {
    expect(isJobPaused(status)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isJobPaused(null as unknown as RunStatus)).toBe(false);
  });
});

// ── getParsedAssetId ───────────────────────────────────────────────────
describe('getParsedAssetId', () => {
  it('extracts hex from DID-based asset ID', () => {
    expect(getParsedAssetId('did:web:example.com/a/abc123')).toBe('abc123');
  });

  it('handles DID with multiple path segments', () => {
    expect(getParsedAssetId('did:web:example.com/some/path/xyz')).toBe('xyz');
  });

  it('returns plain hex ID unchanged', () => {
    expect(getParsedAssetId('abc123')).toBe('abc123');
  });

  it('returns empty string unchanged', () => {
    expect(getParsedAssetId('')).toBe('');
  });
});

// ── getAssetIdFromPath ─────────────────────────────────────────────────
describe('getAssetIdFromPath', () => {
  it('constructs full asset ID from hex and API path', () => {
    const path = '/api/v1/assets/did%3Aweb%3Aexample.com/some';
    expect(getAssetIdFromPath('abc123', path)).toBe('did:web:example.com/a/abc123');
  });
});

// ── getAssetIdFromVenueId ──────────────────────────────────────────────
describe('getAssetIdFromVenueId', () => {
  it('constructs full asset ID from hex and venue ID', () => {
    expect(getAssetIdFromVenueId('abc123', 'did:web:example.com')).toBe(
      'did:web:example.com/a/abc123'
    );
  });
});

// ── fetchWithError ─────────────────────────────────────────────────────
describe('fetchWithError', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns parsed JSON on success', async () => {
    const mockData = { id: '123', name: 'test' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchWithError('https://example.com/api');
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api', undefined);
  });

  it('passes request options to fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const options = { method: 'POST', body: '{}' };
    await fetchWithError('https://example.com/api', options);
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api', options);
  });

  it('throws NotFoundError on 404 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.reject(),
      text: () => Promise.resolve(''),
    });

    await expect(fetchWithError('https://example.com/api')).rejects.toThrow(NotFoundError);
    await expect(fetchWithError('https://example.com/api')).rejects.toThrow(CoviaError);
  });

  it('throws GridError on 500 status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    });

    const err = fetchWithError('https://example.com/api');
    await expect(err).rejects.toThrow(GridError);
    await expect(fetchWithError('https://example.com/api')).rejects.toThrow('HTTP 500');
  });

  it('throws GridError with parsed error body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: 'Validation failed', data: { field: 'name' } }),
    });

    try {
      await fetchWithError('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(GridError);
      expect((e as GridError).statusCode).toBe(422);
      expect((e as GridError).responseBody).toEqual({ error: 'Validation failed', data: { field: 'name' } });
    }
  });

  it('wraps TypeError network errors in CoviaConnectionError', async () => {
    const cause = new TypeError('Failed to fetch');
    global.fetch = jest.fn().mockRejectedValue(cause);

    try {
      await fetchWithError('https://example.com/api', { method: 'POST' });
      throw new Error('Expected fetchWithError to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(CoviaConnectionError);
      expect(error).toBeInstanceOf(CoviaError);
      const connectionError = error as CoviaConnectionError;
      expect(connectionError.url).toBe('https://example.com/api');
      expect(connectionError.method).toBe('POST');
      expect(connectionError.cause).toBe(cause);
      expect(connectionError.message).toContain('POST https://example.com/api');
    }
  });

  it('treats every exception thrown by fetch as a structured transport failure', async () => {
    const cause = new Error('Unknown failure');
    global.fetch = jest.fn().mockRejectedValue(cause);

    try {
      await fetchWithError('https://example.com/api');
      throw new Error('Expected fetchWithError to reject');
    } catch (error) {
      const connectionError = error as CoviaConnectionError;
      expect(connectionError).toBeInstanceOf(CoviaConnectionError);
      expect(connectionError.url).toBe('https://example.com/api');
      expect(connectionError.method).toBe('GET');
      expect(connectionError.cause).toBe(cause);
    }
  });

  it('throws GridError on 403 status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.reject(),
      text: () => Promise.resolve('Forbidden'),
    });

    try {
      await fetchWithError('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(GridError);
      expect((e as GridError).statusCode).toBe(403);
    }
  });
});

// ── fetchStreamWithError ───────────────────────────────────────────────
describe('fetchStreamWithError', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns full Response on success', async () => {
    const mockResponse = { ok: true, status: 200, body: 'stream' };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    const result = await fetchStreamWithError('https://example.com/stream');
    expect(result).toBe(mockResponse);
  });

  it('throws GridError on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request' }),
    });

    await expect(fetchStreamWithError('https://example.com/stream')).rejects.toThrow(GridError);
    await expect(fetchStreamWithError('https://example.com/stream')).rejects.toThrow('HTTP 400');
  });

  it('wraps TypeError network errors in CoviaConnectionError', async () => {
    const cause = new TypeError('Connection refused');
    global.fetch = jest.fn().mockRejectedValue(cause);

    try {
      await fetchStreamWithError('https://example.com/stream', { method: 'DELETE' });
      throw new Error('Expected fetchStreamWithError to reject');
    } catch (error) {
      const connectionError = error as CoviaConnectionError;
      expect(connectionError).toBeInstanceOf(CoviaConnectionError);
      expect(connectionError.url).toBe('https://example.com/stream');
      expect(connectionError.method).toBe('DELETE');
      expect(connectionError.cause).toBe(cause);
    }
  });

  it('wraps other fetch exceptions in CoviaConnectionError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

    await expect(fetchStreamWithError('https://example.com/stream')).rejects.toThrow(CoviaConnectionError);
  });
});
