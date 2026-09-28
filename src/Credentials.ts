import { generateKeyPair, hexToPrivateKey } from './crypto/keys';
import { didFromPublicKey } from './crypto/multikey';
import { createEdDSAJWT, createEdDSAJWTWith } from './crypto/jwt';
import { rawKeySigner, type Ed25519Signer } from './crypto/signer';
import { CoviaError } from './types';

// UTF-8-safe base64 that exists in both browsers and Node ≥ 16 — the SDK's
// primary consumer is a browser app, where Buffer is not defined.
function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Abstract base class for authentication strategies.
 * Subclass this to implement custom authentication.
 *
 * Example — custom API-key auth:
 *
 *   class ApiKeyAuth extends Auth {
 *     constructor(private key: string) { super(); }
 *     apply(headers: Record<string, string>): void {
 *       headers["X-Api-Key"] = this.key;
 *     }
 *   }
 */
export abstract class Auth {
  /**
   * Apply authentication credentials to request headers (mutates in place).
   *
   * @param headers - Outgoing request headers to mutate.
   * @param audience - The venue's DID, supplied by the transport. Providers
   *   that bind tokens to the venue's identity (e.g. {@link Ed25519Auth}) use it
   *   as the JWT `aud`; others ignore it.
   * @returns Nothing, or a promise for providers that sign asynchronously
   *   (e.g. {@link Ed25519Auth.fromSigner} over a WebCrypto key). The transport
   *   awaits it before sending, so callers of `apply` must await it too.
   */
  abstract apply(headers: Record<string, string>, audience?: string): void | Promise<void>;
}

/** No-op authentication provider. Sends no credentials. */
export class NoAuth extends Auth {
  apply(_headers: Record<string, string>, _audience?: string): void {
    // No-op
  }
}

/**
 * Bearer token authentication.
 * Adds `Authorization: Bearer <token>` to every request.
 *
 * Example:
 *   const venue = await Grid.connect("https://your-venue.example.com", new BearerAuth("my-token"));
 */
export class BearerAuth extends Auth {
  private _token: string;

  constructor(token: string) {
    super();
    this._token = token;
  }

  apply(headers: Record<string, string>, _audience?: string): void {
    headers["Authorization"] = `Bearer ${this._token}`;
  }
}

/**
 * HTTP Basic authentication.
 * Adds `Authorization: Basic <base64(username:password)>` to every request.
 *
 * Example:
 *   const venue = await Grid.connect("https://your-venue.example.com", new BasicAuth("admin", "s3cret"));
 */
export class BasicAuth extends Auth {
  private _username: string;
  private _password: string;

  constructor(username: string, password: string) {
    super();
    this._username = username;
    this._password = password;
  }

  apply(headers: Record<string, string>, _audience?: string): void {
    const credentials = base64Encode(`${this._username}:${this._password}`);
    headers["Authorization"] = `Basic ${credentials}`;
  }
}

/**
 * Ed25519 keypair authentication (self-issued EdDSA JWT).
 * Generates a fresh short-lived JWT for every request, signed with the
 * client's Ed25519 private key.  The server verifies the signature and
 * extracts the caller's DID from the `sub` claim.
 *
 * Construct it from a raw 32-byte key, or with {@link Ed25519Auth.fromSigner}
 * from an {@link Ed25519Signer} — e.g. a non-extractable WebCrypto key, which
 * signs without the key ever being readable by page scripts. Signer-backed
 * instances sign asynchronously; the SDK transport awaits them.
 *
 * Example:
 *   const auth = Ed25519Auth.generate();
 *   console.log(auth.getDID()); // did:key:z6Mk...
 *   const venue = await Grid.connect("https://your-venue.example.com", auth);
 *
 *   // Non-extractable key (browser):
 *   const signer = await webCryptoSigner(await generateNonExtractableKeyPair());
 *   const venue2 = await Grid.connect("https://your-venue.example.com", Ed25519Auth.fromSigner(signer));
 */
export class Ed25519Auth extends Auth {
  /** Present only for raw-key instances; signer-backed ones never see key bytes. */
  private _privateKey?: Uint8Array;
  private _signer: Ed25519Signer;
  private _publicKey: Uint8Array;
  private _did: string;
  private _lifetime: number;
  private _audience?: string;

  /**
   * @param key - 32-byte Ed25519 private key, or an {@link Ed25519Signer}
   * @param tokenLifetimeSeconds - JWT lifetime in seconds (default 300 = 5 min)
   */
  constructor(key: Uint8Array | Ed25519Signer, tokenLifetimeSeconds: number = 300) {
    super();
    if (isSigner(key)) {
      this._signer = key;
    } else {
      this._privateKey = key;
      this._signer = rawKeySigner(key);
    }
    this._publicKey = this._signer.publicKey;
    this._did = didFromPublicKey(this._publicKey);
    this._lifetime = tokenLifetimeSeconds;
  }

  apply(headers: Record<string, string>, audience?: string): void | Promise<void> {
    // Raw keys stay synchronous so direct callers of apply() keep working.
    if (this._privateKey) {
      headers['Authorization'] = `Bearer ${this.identityToken(audience)}`;
      return;
    }
    return this.mintIdentityToken(audience).then((token) => {
      headers['Authorization'] = `Bearer ${token}`;
    });
  }

  /**
   * Mint a bearer-usable identity JWT for this key — the same token
   * {@link apply} attaches to every request, exposed for callers that need
   * to present this identity elsewhere (CLI tools, curl, another client:
   * `Authorization: Bearer <token>`).
   *
   * An explicitly-pinned {@link audience} wins; otherwise the JWT `aud` is
   * bound to the venue DID given here. A token with no `aud` is replayable
   * at any venue that accepts the caller's DID, so minting one is refused
   * rather than silently weakened.
   *
   * Raw-key instances only: a signer-backed instance signs asynchronously,
   * so use {@link mintIdentityToken}, which works for both.
   *
   * @param audience - The venue DID the token is bound to (`aud` claim).
   * @param lifetimeSeconds - Token lifetime; defaults to this instance's.
   */
  identityToken(audience?: string, lifetimeSeconds?: number): string {
    const aud = this.resolveAudience(audience);
    if (!this._privateKey) {
      throw new CoviaError(
        'Ed25519Auth.identityToken() needs a raw private key; this instance signs through an ' +
        'Ed25519Signer, so use the async mintIdentityToken() instead.');
    }
    return createEdDSAJWT(this._privateKey, lifetimeSeconds ?? this._lifetime, aud);
  }

  /**
   * Async {@link identityToken} that works for raw-key and signer-backed
   * instances alike. Same token, same audience rules.
   */
  async mintIdentityToken(audience?: string, lifetimeSeconds?: number): Promise<string> {
    const aud = this.resolveAudience(audience);
    return createEdDSAJWTWith(this._signer, lifetimeSeconds ?? this._lifetime, aud);
  }

  private resolveAudience(audience?: string): string {
    const aud = this._audience ?? (audience || undefined);
    if (!aud) {
      throw new CoviaError(
        'Ed25519Auth requires a venue audience to bind the token to: connect via ' +
        'Grid.connect()/Venue.connect() so the venue DID is known, or pin auth.audience explicitly.');
    }
    return aud;
  }

  /** The caller's DID derived from the public key. */
  getDID(): string {
    return this._did;
  }

  /**
   * Explicitly pin the JWT `aud` claim. Overrides the venue DID the transport
   * supplies — normally unnecessary, since the venue DID is the correct audience.
   */
  set audience(value: string | undefined) { this._audience = value; }
  get audience(): string | undefined { return this._audience; }

  /** The 32-byte Ed25519 public key. */
  getPublicKey(): Uint8Array {
    return this._publicKey;
  }

  /** Generate a new random keypair and return an Ed25519Auth instance. */
  static generate(tokenLifetimeSeconds: number = 300): Ed25519Auth {
    const { privateKey } = generateKeyPair();
    return new Ed25519Auth(privateKey, tokenLifetimeSeconds);
  }

  /** Create from a hex-encoded private key string. */
  static fromHex(privateKeyHex: string, tokenLifetimeSeconds: number = 300): Ed25519Auth {
    return new Ed25519Auth(hexToPrivateKey(privateKeyHex), tokenLifetimeSeconds);
  }

  /**
   * Create from an {@link Ed25519Signer}, e.g. `await webCryptoSigner(keyPair)`
   * over a non-extractable WebCrypto key. Requests sign asynchronously.
   */
  static fromSigner(signer: Ed25519Signer, tokenLifetimeSeconds: number = 300): Ed25519Auth {
    return new Ed25519Auth(signer, tokenLifetimeSeconds);
  }
}

function isSigner(key: Uint8Array | Ed25519Signer): key is Ed25519Signer {
  return !ArrayBuffer.isView(key) && typeof key.sign === 'function';
}

/**
 * @deprecated Renamed to {@link Ed25519Auth} for cross-SDK consistency
 * (the Python SDK uses the same name). This alias keeps existing
 * `KeyPairAuth` / `KeyPairAuth.generate()` / `KeyPairAuth.fromHex()` usage
 * working; prefer `Ed25519Auth` in new code.
 */
export const KeyPairAuth = Ed25519Auth;
/** @deprecated Renamed to {@link Ed25519Auth}. */
export type KeyPairAuth = Ed25519Auth;

/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, BasicAuth, Ed25519Auth). */
export interface Credentials {
  venueId: string;
  apiKey: string;
  userId: string;
}

/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, BasicAuth, Ed25519Auth). */
export class CredentialsHTTP implements Credentials {
  constructor(public venueId: string, public apiKey: string, public userId: string) {}
}
