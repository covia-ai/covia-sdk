import { versionAtLeast, ROUTE_MISSING_404 } from '../venue-features';

describe('versionAtLeast', () => {
  it('compares major.minor', () => {
    expect(versionAtLeast('0.5.0', 0, 5)).toBe(true);    // equal
    expect(versionAtLeast('0.6.0', 0, 5)).toBe(true);    // newer minor
    expect(versionAtLeast('1.0.0', 0, 9)).toBe(true);    // newer major beats older minor
    expect(versionAtLeast('0.4.9', 0, 5)).toBe(false);   // older minor
    expect(versionAtLeast('0.9.0', 1, 0)).toBe(false);   // older major beats newer minor
  });

  it('compares numerically, not lexically', () => {
    expect(versionAtLeast('0.10.0', 0, 9)).toBe(true);
    expect(versionAtLeast('0.9.0', 0, 10)).toBe(false);
  });

  it('ignores patch and pre-release suffixes', () => {
    expect(versionAtLeast('0.5', 0, 5)).toBe(true);
    expect(versionAtLeast('0.5.0-SNAPSHOT', 0, 5)).toBe(true);
    expect(versionAtLeast('0.4.99-rc1', 0, 5)).toBe(false);
  });

  // Optimistic: a wrong "yes" is corrected by the 404 probe; a wrong "no" never recovers.
  it('treats missing or unparseable versions as supported', () => {
    expect(versionAtLeast(undefined, 9, 9)).toBe(true);
    expect(versionAtLeast('', 9, 9)).toBe(true);
    expect(versionAtLeast('v0.1.0', 9, 9)).toBe(true);
    expect(versionAtLeast('develop', 9, 9)).toBe(true);
  });
});

describe('ROUTE_MISSING_404', () => {
  it('matches the venue body for an unmapped route', () => {
    expect(ROUTE_MISSING_404.test('Endpoint GET /api/v1/agents/x/events not found')).toBe(true);
    expect(ROUTE_MISSING_404.test('Endpoint POST /api/v1/values/slice not found')).toBe(true);
  });

  // A mapped route 404ing for a missing resource must not latch a feature off (covia#180).
  it('does not match a per-resource 404', () => {
    expect(ROUTE_MISSING_404.test('Agent not found: x')).toBe(false);
    expect(ROUTE_MISSING_404.test('Request failed with status 404')).toBe(false);
    expect(ROUTE_MISSING_404.test('Endpoint FETCH /x')).toBe(false);
  });
});
