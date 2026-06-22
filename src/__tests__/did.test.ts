import { Namespace, isDid, didMethod, parseDidUrl, didUrl, assetHash } from '../did';

describe('isDid', () => {
  it.each([
    'did:key:z6MkABC',
    'did:web:venue.covia.ai',
    'did:web:host%3A3000',
    'did:web:example.com:user:alice',
  ])('accepts bare DID %s', (v) => expect(isDid(v)).toBe(true));

  it.each([
    'did:key:z6Mk.../w/foo', // DID URL, not a bare DID
    'did:key:',
    'did:',
    'not-a-did',
    'https://venue.covia.ai',
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
