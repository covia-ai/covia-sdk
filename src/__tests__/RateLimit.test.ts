import { parseRetryAfterMs, retryDelayMs, fetchWithError } from '../Utils';
import { RateLimitError } from '../types';

// Deterministic tests for 429 backpressure handling (covia-sdk#14): the retry
// decision is pure (random supplied explicitly), and the loop test forces
// zero delays (Retry-After: 0 + random 0) so nothing depends on timing.

describe('retry policy (pure)', () => {
  it('honours Retry-After as the floor', () => {
    expect(retryDelayMs(1, 3000, 60_000, 0)).toBe(3000);
  });

  it('applies full jitter within the backoff', () => {
    // attempt 3 → backoff = 200 * 2^2 = 800; random 0.5 → 400
    expect(retryDelayMs(3, 0, 60_000, 0.5)).toBe(400);
    expect(retryDelayMs(3, 0, 60_000, 0.999)).toBeLessThan(800);
  });

  it('gives up after max attempts and over budget', () => {
    expect(retryDelayMs(4, 0, 60_000, 0)).toBe(-1);   // attempts exhausted
    expect(retryDelayMs(1, 5000, 1000, 0)).toBe(-1);  // Retry-After exceeds budget
  });

  it('parses Retry-After forms', () => {
    expect(parseRetryAfterMs('5', 0)).toBe(5000);
    expect(parseRetryAfterMs(null, 0)).toBe(0);
    expect(parseRetryAfterMs('garbage', 0)).toBe(0);
    const now = Date.now();
    expect(parseRetryAfterMs(new Date(now + 10_000).toUTCString(), now)).toBeGreaterThan(8000);
  });
});

describe('fetchWithError 429 loop', () => {
  const mockFetch = jest.fn();
  const realRandom = Math.random;
  beforeEach(() => { global.fetch = mockFetch as any; mockFetch.mockReset(); Math.random = () => 0; });
  afterEach(() => { Math.random = realRandom; });

  const resp429 = () => ({
    ok: false, status: 429,
    headers: { get: (h: string) => (h === 'Retry-After' ? '0' : null) },
    json: () => Promise.resolve({ error: 'Rate limit exceeded' }),
    text: () => Promise.resolve('Rate limit exceeded'),
  });
  const resp200 = (data: any) => ({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(data) });

  it('retries a 429 and succeeds (zero-delay, no timing)', async () => {
    mockFetch.mockResolvedValueOnce(resp429()).mockResolvedValueOnce(resp200({ ok: 1 }));
    const r = await fetchWithError<any>('https://v.example/x');
    expect(r.ok).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after attempts are exhausted', async () => {
    mockFetch.mockResolvedValue(resp429());
    await expect(fetchWithError('https://v.example/x')).rejects.toBeInstanceOf(RateLimitError);
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });

  it('does not retry non-429 errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null },
      json: () => Promise.resolve({ error: 'boom' }), text: () => Promise.resolve('boom') });
    await expect(fetchWithError('https://v.example/x')).rejects.toThrow('boom');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
