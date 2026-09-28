import { verify } from '@noble/ed25519';
import { Ed25519Auth } from '../Credentials';
import { generateKeyPair, hexToPrivateKey, privateKeyToHex } from '../crypto/keys';
import { didFromPublicKey } from '../crypto/multikey';
import { createEdDSAJWT, createEdDSAJWTWith } from '../crypto/jwt';
import {
  createUCANJWT,
  createUCANJWTWith,
  didFor,
  grant,
  grantWith,
  relayDelegation,
  relayDelegationWith,
} from '../crypto/ucan';
import {
  generateNonExtractableKeyPair,
  importNonExtractableKey,
  isWebCryptoEd25519Supported,
  rawKeySigner,
  webCryptoSigner,
} from '../crypto/signer';
import { venueJson } from '../VenueTransport';

// Signer-based signing (covia-sdk#68). Ed25519 is deterministic, so with the
// clock frozen a WebCrypto-signed token must be byte-for-byte the raw-key one.

const VENUE = 'did:web:venue.example.com';
const NOW = 1_790_000_000_000;

function decodePart(part: string): any {
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

function signatureValid(jwt: string, publicKey: Uint8Array): boolean {
  const [h, p, s] = jwt.split('.');
  const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return verify(new Uint8Array(sig), new TextEncoder().encode(`${h}.${p}`), publicKey);
}

describe('Ed25519 signers', () => {
  let nowSpy: jest.SpyInstance;
  beforeEach(() => { nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW); });
  afterEach(() => nowSpy.mockRestore());

  it('WebCrypto Ed25519 is available in the test runtime', async () => {
    await expect(isWebCryptoEd25519Supported()).resolves.toBe(true);
  });

  it('a generated keypair cannot be exported, yet signs tokens the public key verifies', async () => {
    const kp = await generateNonExtractableKeyPair();
    await expect(crypto.subtle.exportKey('pkcs8', kp.privateKey)).rejects.toThrow();

    const signer = await webCryptoSigner(kp);
    expect(signer.publicKey).toHaveLength(32);

    const jwt = await createEdDSAJWTWith(signer, 300, VENUE);
    expect(signatureValid(jwt, signer.publicKey)).toBe(true);
    const [h, p] = jwt.split('.');
    expect(decodePart(h)).toEqual({ alg: 'EdDSA', typ: 'JWT', kid: didFromPublicKey(signer.publicKey).slice(8) });
    expect(decodePart(p)).toMatchObject({ sub: didFromPublicKey(signer.publicKey), aud: VENUE, exp: NOW / 1000 + 300 });
  });

  it('migrating a raw key keeps its DID and produces identical tokens', async () => {
    const { privateKey } = generateKeyPair();
    const hex = privateKeyToHex(privateKey);

    const kp = await importNonExtractableKey(hexToPrivateKey(hex));
    await expect(crypto.subtle.exportKey('pkcs8', kp.privateKey)).rejects.toThrow();
    const signer = await webCryptoSigner(kp);

    expect(didFromPublicKey(signer.publicKey)).toBe(didFor(privateKey));
    expect(await createEdDSAJWTWith(signer, 300, VENUE)).toBe(createEdDSAJWT(privateKey, 300, VENUE));
  });

  it('rejects a private key that is not 32 bytes', async () => {
    await expect(importNonExtractableKey(new Uint8Array(31))).rejects.toThrow(/32 bytes/);
  });

  it('rawKeySigner matches the sync raw-key path', async () => {
    const { privateKey } = generateKeyPair();
    expect(await createEdDSAJWTWith(rawKeySigner(privateKey), 60, VENUE)).toBe(createEdDSAJWT(privateKey, 60, VENUE));
  });

  it('signer-based UCANs are identical to raw-key UCANs', async () => {
    const { privateKey } = generateKeyPair();
    const signer = await webCryptoSigner(await importNonExtractableKey(privateKey));
    const caps = [{ with: 'did:key:zAlice/w/shared/', can: 'crud/read' }];

    expect(await createUCANJWTWith(signer, VENUE, caps, 3600, ['parent.jwt.sig']))
      .toBe(createUCANJWT(privateKey, VENUE, caps, 3600, ['parent.jwt.sig']));
    expect(await createUCANJWTWith(signer, VENUE, [], null)).toBe(createUCANJWT(privateKey, VENUE, [], null));
    expect(await grantWith(signer, 'did:key:z6MkBob', 'did:key:zAlice/w/', 'crud/read', 600))
      .toBe(grant(privateKey, 'did:key:z6MkBob', 'did:key:zAlice/w/', 'crud/read', 600));
    expect(await relayDelegationWith(signer, VENUE, 600, caps))
      .toBe(relayDelegation(privateKey, VENUE, 600, caps));
  });
});

describe('Ed25519Auth.fromSigner', () => {
  it('exposes the DID and public key of the signer', async () => {
    const signer = await webCryptoSigner(await generateNonExtractableKeyPair());
    const auth = Ed25519Auth.fromSigner(signer);
    expect(auth.getPublicKey()).toEqual(signer.publicKey);
    expect(auth.getDID()).toBe(didFromPublicKey(signer.publicKey));
  });

  it('apply() resolves after setting an aud-bound Bearer JWT', async () => {
    const signer = await webCryptoSigner(await generateNonExtractableKeyPair());
    const headers: Record<string, string> = {};
    await Ed25519Auth.fromSigner(signer, 120).apply(headers, VENUE);

    const jwt = headers['Authorization'].replace(/^Bearer /, '');
    expect(signatureValid(jwt, signer.publicKey)).toBe(true);
    const claims = decodePart(jwt.split('.')[1]);
    expect(claims.aud).toBe(VENUE);
    expect(claims.exp - claims.iat).toBe(120);
  });

  it('apply() rejects without an audience rather than minting an unbound token', async () => {
    const signer = await webCryptoSigner(await generateNonExtractableKeyPair());
    await expect(Ed25519Auth.fromSigner(signer).apply({})).rejects.toThrow(/audience/);
  });

  it('identityToken() points signer-backed callers at mintIdentityToken()', async () => {
    const signer = await webCryptoSigner(await generateNonExtractableKeyPair());
    const auth = Ed25519Auth.fromSigner(signer);
    expect(() => auth.identityToken(VENUE)).toThrow(/mintIdentityToken/);
    const token = await auth.mintIdentityToken(VENUE, 3600);
    const claims = decodePart(token.split('.')[1]);
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it('mintIdentityToken() equals identityToken() for raw-key instances', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    try {
      const auth = Ed25519Auth.generate();
      expect(await auth.mintIdentityToken(VENUE)).toBe(auth.identityToken(VENUE));
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('raw-key apply() stays synchronous for existing direct callers', () => {
    const headers: Record<string, string> = {};
    const result = Ed25519Auth.generate().apply(headers, VENUE);
    expect(result).toBeUndefined();
    expect(headers['Authorization']).toMatch(/^Bearer /);
  });
});

describe('VenueTransport with async auth', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('waits for an async apply() before sending the request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    global.fetch = fetchMock;

    const signer = await webCryptoSigner(await generateNonExtractableKeyPair());
    const venue = { baseUrl: 'https://venue.example.com', venueId: VENUE, auth: Ed25519Auth.fromSigner(signer) };
    await venueJson(venue, '/api/v1/status');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const auth = (init.headers as Record<string, string>)['Authorization'];
    expect(auth).toMatch(/^Bearer /);
    expect(signatureValid(auth.slice(7), signer.publicKey)).toBe(true);
  });

  it('surfaces an auth failure as a rejection, not a thrown error', async () => {
    const venue = {
      baseUrl: 'https://venue.example.com',
      venueId: VENUE,
      auth: { apply: () => Promise.reject(new Error('signing failed')) },
    };
    const pending = venueJson(venue, '/api/v1/status');
    await expect(pending).rejects.toThrow('signing failed');
  });
});
