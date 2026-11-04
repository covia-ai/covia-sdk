import { Namespace, isDid, didMethod, parseDidUrl, didUrl, assetHash, didWebToUrl, urlToDidWeb } from '../did';

describe('isDid', () => {
  it.each([
    'did:key:z6MkABC',
    'did:web:venue.example.com',
    'did:web:host%3A3000',
    'did:web:example.com:user:alice',
  ])('accepts bare DID %s', (v) => expect(isDid(v)).toBe(true));

  it.each([
    'did:key:z6Mk.../w/foo', // DID URL, not a bare DID
    'did:key:',
    'did:',
    'not-a-did',
    'https://venue.example.com',
    '',
  ])('rejects %s', (v) => expect(isDid(v)).toBe(false));
});

describe('didMethod', () => {
  it('returns the method', () => {
    expect(didMethod('did:key:z6Mk')).toBe('key');
    expect(didMethod('did:web:host')).toBe('web');
  });
  it('returns null for non-DIDs', () => {
    expect(didMethod('w/foo')).toBeNull();
  });
});

describe('didUrl', () => {
  it('builds with a DID', () => {
    expect(didUrl('did:key:zA', Namespace.WORKSPACE, 'projects', 'acme')).toBe('did:key:zA/w/projects/acme');
  });
  it('builds a relative path', () => {
    expect(didUrl(null, Namespace.WORKSPACE, 'projects', 'acme')).toBe('w/projects/acme');
  });
  it('namespace only', () => {
    expect(didUrl('did:key:zA', Namespace.AGENT)).toBe('did:key:zA/g');
  });
  it('strips stray slashes and drops empty segments', () => {
    expect(didUrl('did:key:zA', 'w', '/a/', '', 'b/')).toBe('did:key:zA/w/a/b');
  });
});

describe('parseDidUrl', () => {
  it('full DID URL', () => {
    expect(parseDidUrl('did:key:z6Mk/w/projects/acme')).toEqual({ did: 'did:key:z6Mk', namespace: 'w', path: 'projects/acme' });
  });
  it('relative path (with and without leading slash)', () => {
    expect(parseDidUrl('w/foo')).toEqual({ did: null, namespace: 'w', path: 'foo' });
    expect(parseDidUrl('/w/foo')).toEqual({ did: null, namespace: 'w', path: 'foo' });
  });
  it('bare DID', () => {
    expect(parseDidUrl('did:web:host')).toEqual({ did: 'did:web:host', namespace: null, path: '' });
  });
  it('keeps did:web path separators in the DID', () => {
    expect(parseDidUrl('did:web:example.com:u:alice/w/foo')).toEqual({ did: 'did:web:example.com:u:alice', namespace: 'w', path: 'foo' });
  });
  it('round-trips with didUrl', () => {
    const built = didUrl('did:key:z6Mk', 'w', 'projects', 'acme');
    expect(parseDidUrl(built)).toEqual({ did: 'did:key:z6Mk', namespace: 'w', path: 'projects/acme' });
  });
});

describe('assetHash', () => {
  it.each([
    ['abcdef0123', 'abcdef0123'],
    ['0xCAFEBABE', '0xCAFEBABE'],
    ['a/cafebabe', 'cafebabe'],
    ['did:key:zA/a/cafebabe', 'cafebabe'],
  ])('content-addressed %s -> %s', (ref, expected) => expect(assetHash(ref)).toBe(expected));

  it.each(['w/my-assets/foo', 'o/my-op', 'did:key:zA/w/x', 'not-a-hash'])(
    'not content-addressed: %s',
    (ref) => expect(assetHash(ref)).toBeNull(),
  );
});

// Same cases as the Python SDK's tests/unit/test_did.py TestDidWeb (#126).
describe('didWebToUrl', () => {
  it.each([
    ['did:web:venue.covia.ai', 'https://venue.covia.ai'],
    ['did:web:localhost%3A8080', 'https://localhost:8080'],
    ['did:web:example.com:user:alice', 'https://example.com/user/alice'],
    ['did:web:host%3A3000:a:b', 'https://host:3000/a/b'],
    ['did:web:host%3a3000', 'https://host:3000'],
  ])('%s → %s', (did, url) => expect(didWebToUrl(did)).toBe(url));

  it('takes an http scheme', () => {
    expect(didWebToUrl('did:web:localhost%3A8080', { scheme: 'http' })).toBe('http://localhost:8080');
  });

  it.each(['did:key:z6Mk', 'did:web:', 'venue.covia.ai'])('rejects %s', (v) => {
    expect(() => didWebToUrl(v)).toThrow(/did:web/);
  });
});

describe('urlToDidWeb', () => {
  it.each([
    ['https://venue.covia.ai', 'did:web:venue.covia.ai'],
    ['https://venue.covia.ai/', 'did:web:venue.covia.ai'],
    ['https://venue.covia.ai///', 'did:web:venue.covia.ai'],
    ['https://localhost:8080', 'did:web:localhost%3A8080'],
    ['https://example.com/user/alice', 'did:web:example.com:user:alice'],
    ['http://host:3000/a/b', 'did:web:host%3A3000:a:b'],
    ['venue.covia.ai', 'did:web:venue.covia.ai'],
  ])('%s → %s', (url, did) => expect(urlToDidWeb(url)).toBe(did));

  it.each(['ftp://example.com', 'https://', ''])('rejects %j', (v) => {
    expect(() => urlToDidWeb(v)).toThrow();
  });

  it.each(['https://venue.covia.ai', 'https://localhost:8080', 'https://example.com/user/alice'])(
    'round-trips %s', (url) => expect(didWebToUrl(urlToDidWeb(url))).toBe(url),
  );
});

it('urlToDidWeb handles a long run of slashes quickly', () => {
  const start = Date.now();
  expect(() => urlToDidWeb('https://' + '/'.repeat(100000) + 'x')).not.toThrow();
  expect(Date.now() - start).toBeLessThan(1000);
});
