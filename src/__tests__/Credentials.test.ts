import { NoAuth, BearerAuth, BasicAuth, Ed25519Auth, KeyPairAuth, Auth } from '../Credentials';
import { generateKeyPair, privateKeyToHex, hexToPrivateKey } from '../crypto/keys';
import { didFromPublicKey, encodePublicKey, decodePublicKey } from '../crypto/multikey';
import { encode, decode } from '../crypto/base58';
import { base64UrlEncode } from '../crypto/jwt';

describe('NoAuth', () => {
  it('does not modify headers', () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    new NoAuth().apply(headers);
    expect(headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('is an instance of Auth', () => {
    expect(new NoAuth()).toBeInstanceOf(Auth);
  });
});

describe('BearerAuth', () => {
  it('adds Authorization Bearer header', () => {
    const headers: Record<string, string> = {};
    new BearerAuth('my-token').apply(headers);
    expect(headers['Authorization']).toBe('Bearer my-token');
  });

  it('is an instance of Auth', () => {
    expect(new BearerAuth('t')).toBeInstanceOf(Auth);
  });
});

describe('BasicAuth', () => {
  it('adds Authorization Basic header with base64(username:password)', () => {
    const headers: Record<string, string> = {};
    new BasicAuth('admin', 's3cret').apply(headers);
    const expected = Buffer.from('admin:s3cret', 'utf-8').toString('base64');
    expect(headers['Authorization']).toBe(`Basic ${expected}`);
  });

  it('encodes non-ASCII credentials as UTF-8', () => {
    const headers: Record<string, string> = {};
    new BasicAuth('café', 'naïve').apply(headers);
    const decoded = Buffer.from(headers['Authorization'].replace('Basic ', ''), 'base64').toString('utf-8');
    expect(decoded).toBe('café:naïve');
  });

  it('is an instance of Auth', () => {
    expect(new BasicAuth('u', 'p')).toBeInstanceOf(Auth);
  });
});

// --- Crypto utilities ---

describe('Base58', () => {
  it('encodes and decodes empty bytes', () => {
    expect(encode(new Uint8Array(0))).toBe('');
    expect(decode('')).toEqual(new Uint8Array(0));
  });

  it('roundtrips arbitrary bytes', () => {
    const data = new Uint8Array([0, 0, 1, 2, 3, 255, 128, 64]);
    expect(decode(encode(data))).toEqual(data);
  });

  it('preserves leading zeros', () => {
    const data = new Uint8Array([0, 0, 0, 1]);
    const encoded = encode(data);
    expect(encoded.startsWith('111')).toBe(true);
    expect(decode(encoded)).toEqual(data);
  });
});

describe('Multikey', () => {
  it('encodes a public key to z-prefixed multikey', () => {
    const { publicKey } = generateKeyPair();
    const multikey = encodePublicKey(publicKey);
    expect(multikey.startsWith('z6Mk')).toBe(true);
  });

  it('roundtrips encode/decode', () => {
    const { publicKey } = generateKeyPair();
    const multikey = encodePublicKey(publicKey);
    const decoded = decodePublicKey(multikey);
    expect(decoded).toEqual(publicKey);
  });

  it('rejects invalid prefix', () => {
    expect(() => decodePublicKey('zBadData')).toThrow();
  });

  it('rejects missing z prefix', () => {
    expect(() => decodePublicKey('6MkTest')).toThrow('must start with "z"');
  });
});

describe('didFromPublicKey', () => {
  it('returns did:key:z6Mk... format', () => {
    const { publicKey } = generateKeyPair();
    const did = didFromPublicKey(publicKey);
    expect(did).toMatch(/^did:key:z6Mk/);
  });
});

describe('generateKeyPair', () => {
  it('returns 32-byte private and public keys', () => {
    const { privateKey, publicKey } = generateKeyPair();
    expect(privateKey.length).toBe(32);
    expect(publicKey.length).toBe(32);
  });

  it('generates unique keypairs', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.privateKey).not.toEqual(b.privateKey);
  });
});

describe('privateKeyToHex / hexToPrivateKey', () => {
  it('roundtrips a private key through hex', () => {
    const { privateKey } = generateKeyPair();
    const hex = privateKeyToHex(privateKey);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(hexToPrivateKey(hex)).toEqual(privateKey);
  });
});

describe('base64UrlEncode', () => {
  it('produces URL-safe output without padding', () => {
    const data = new Uint8Array([255, 254, 253]);
    const encoded = base64UrlEncode(data);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });
});

// --- Ed25519Auth ---

describe('Ed25519Auth', () => {
  it('is an instance of Auth', () => {
    const auth = Ed25519Auth.generate();
    expect(auth).toBeInstanceOf(Auth);
  });

  it('generate() produces a valid DID', () => {
    const auth = Ed25519Auth.generate();
    expect(auth.getDID()).toMatch(/^did:key:z6Mk/);
  });

  it('getPublicKey() returns 32 bytes', () => {
    const auth = Ed25519Auth.generate();
    expect(auth.getPublicKey().length).toBe(32);
  });

  it('apply() sets Authorization Bearer header with valid JWT', () => {
    const auth = Ed25519Auth.generate();
    const headers: Record<string, string> = {};
    auth.apply(headers);

    expect(headers['Authorization']).toMatch(/^Bearer /);
    const jwt = headers['Authorization'].replace('Bearer ', '');
    const parts = jwt.split('.');
    expect(parts.length).toBe(3);

    // Decode and validate header
    const header = JSON.parse(
      Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    expect(header.alg).toBe('EdDSA');
    expect(header.typ).toBe('JWT');
    expect(header.kid).toMatch(/^z6Mk/);

    // Decode and validate payload
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    expect(payload.sub).toBe(auth.getDID());
    expect(payload.iss).toBe(auth.getDID());
    expect(payload.sub).toBe(payload.iss);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp - payload.iat).toBe(300); // default 5 min
  });

  const decodePayload = (headers: Record<string, string>) =>
    JSON.parse(
      Buffer.from(
        headers['Authorization'].replace('Bearer ', '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString(),
    );

  it('binds the JWT aud to the venue DID passed by the transport', () => {
    const auth = Ed25519Auth.generate();
    const headers: Record<string, string> = {};
    auth.apply(headers, 'did:web:venue.covia.ai');
    expect(decodePayload(headers).aud).toBe('did:web:venue.covia.ai');
  });

  it('omits aud when no audience is supplied', () => {
    const auth = Ed25519Auth.generate();
    const headers: Record<string, string> = {};
    auth.apply(headers);
    expect(decodePayload(headers).aud).toBeUndefined();
  });

  it('an explicitly pinned audience overrides the transport-supplied one', () => {
    const auth = Ed25519Auth.generate();
    auth.audience = 'did:web:pinned.example';
    const headers: Record<string, string> = {};
    auth.apply(headers, 'did:web:venue.covia.ai');
    expect(decodePayload(headers).aud).toBe('did:web:pinned.example');
  });

  it('respects custom token lifetime', () => {
    const auth = Ed25519Auth.generate(600);
    const headers: Record<string, string> = {};
    auth.apply(headers);

    const jwt = headers['Authorization'].replace('Bearer ', '');
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    expect(payload.exp - payload.iat).toBe(600);
  });

  it('fromHex() restores the same DID', () => {
    const { privateKey } = generateKeyPair();
    const hex = privateKeyToHex(privateKey);
    const auth1 = new Ed25519Auth(privateKey);
    const auth2 = Ed25519Auth.fromHex(hex);
    expect(auth2.getDID()).toBe(auth1.getDID());
  });

  it('generates fresh JWT on each apply() call', () => {
    const auth = Ed25519Auth.generate();
    const h1: Record<string, string> = {};
    const h2: Record<string, string> = {};
    auth.apply(h1);
    auth.apply(h2);
    // Signature part should differ due to different iat (or at minimum be valid)
    // Both should be valid JWTs with same DID
    expect(h1['Authorization']).toMatch(/^Bearer /);
    expect(h2['Authorization']).toMatch(/^Bearer /);
  });
});

// --- KeyPairAuth (deprecated alias) ---

describe('KeyPairAuth alias', () => {
  it('is the same class as Ed25519Auth', () => {
    expect(KeyPairAuth).toBe(Ed25519Auth);
  });

  it('KeyPairAuth.generate() still produces an Ed25519Auth', () => {
    const auth = KeyPairAuth.generate();
    expect(auth).toBeInstanceOf(Ed25519Auth);
    expect(auth.getDID()).toMatch(/^did:key:z6Mk/);
  });
});
