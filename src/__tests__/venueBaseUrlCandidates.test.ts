import { venueBaseUrlCandidates } from '../Venue';

describe('venueBaseUrlCandidates', () => {
  it('honours an explicit scheme as a single candidate (no fallback)', () => {
    expect(venueBaseUrlCandidates('https://venue-1.covia.ai')).toEqual(['https://venue-1.covia.ai']);
    expect(venueBaseUrlCandidates('http://example.com:9000')).toEqual(['http://example.com:9000']);
    // explicit http on a local host is honoured, never upgraded to https
    expect(venueBaseUrlCandidates('http://localhost:8080')).toEqual(['http://localhost:8080']);
    expect(venueBaseUrlCandidates('https://localhost:8080')).toEqual(['https://localhost:8080']);
  });

  it('strips a single trailing slash from explicit URLs (unchanged behaviour)', () => {
    expect(venueBaseUrlCandidates('https://venue-1.covia.ai/')).toEqual(['https://venue-1.covia.ai']);
  });

  it('uses https only for bare public hosts and IPs', () => {
    expect(venueBaseUrlCandidates('venue-1.covia.ai')).toEqual(['https://venue-1.covia.ai']);
    expect(venueBaseUrlCandidates('venue-1.covia.ai:8080')).toEqual(['https://venue-1.covia.ai:8080']);
    expect(venueBaseUrlCandidates('20.204.126.163:8080')).toEqual(['https://20.204.126.163:8080']);
  });

  it('tries http then https for schemeless local hosts', () => {
    expect(venueBaseUrlCandidates('localhost:8080')).toEqual(['http://localhost:8080', 'https://localhost:8080']);
    expect(venueBaseUrlCandidates('127.0.0.1:8080')).toEqual(['http://127.0.0.1:8080', 'https://127.0.0.1:8080']);
    expect(venueBaseUrlCandidates('192.168.1.5:8443')).toEqual(['http://192.168.1.5:8443', 'https://192.168.1.5:8443']);
    expect(venueBaseUrlCandidates('10.0.0.3')).toEqual(['http://10.0.0.3', 'https://10.0.0.3']);
    expect(venueBaseUrlCandidates('172.16.4.2:8080')).toEqual(['http://172.16.4.2:8080', 'https://172.16.4.2:8080']);
    expect(venueBaseUrlCandidates('dev-box.local:8080')).toEqual(['http://dev-box.local:8080', 'https://dev-box.local:8080']);
  });

  it('does not treat 172.32+ as private', () => {
    expect(venueBaseUrlCandidates('172.32.0.1')).toEqual(['https://172.32.0.1']);
  });
});
