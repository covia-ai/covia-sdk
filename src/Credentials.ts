import { getPublicKey, generateKeyPair, hexToPrivateKey } from './crypto/keys';
import { didFromPublicKey } from './crypto/multikey';
import { createEdDSAJWT } from './crypto/jwt';

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
   */
  abstract apply(headers: Record<string, string>, audience?: string): void;
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
 *   const venue = await Grid.connect("https://venue.covia.ai", new BearerAuth("my-token"));
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
 *   const venue = await Grid.connect("https://venue.covia.ai", new BasicAuth("admin", "s3cret"));
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
    const credentials = Buffer.from(`${this._username}:${this._password}`, 'utf-8').toString('base64');
    headers["Authorization"] = `Basic ${credentials}`;
  }
}

/**
 * Ed25519 keypair authentication (self-issued EdDSA JWT).
 * Generates a fresh short-lived JWT for every request, signed with the
 * client's Ed25519 private key.  The server verifies the signature and
 * extracts the caller's DID from the `sub` claim.
 *
 * Example:
 *   const auth = Ed25519Auth.generate();
 *   console.log(auth.getDID()); // did:key:z6Mk...
 *   const venue = await Grid.connect("https://venue.covia.ai", auth);
 */
export class Ed25519Auth extends Auth {
  private _privateKey: Uint8Array;
  private _publicKey: Uint8Array;
  private _did: string;
  private _lifetime: number;
  private _audience?: string;

  /**
   * @param privateKey - 32-byte Ed25519 private key
   * @param tokenLifetimeSeconds - JWT lifetime in seconds (default 300 = 5 min)
   */
  constructor(privateKey: Uint8Array, tokenLifetimeSeconds: number = 300) {
    super();
    this._privateKey = privateKey;
    this._publicKey = getPublicKey(privateKey);
    this._did = didFromPublicKey(this._publicKey);
    this._lifetime = tokenLifetimeSeconds;
  }

  apply(headers: Record<string, string>, audience?: string): void {
    // An explicitly-pinned audience wins; otherwise bind the JWT `aud` to the
    // venue DID the transport supplies. With neither, no `aud` is sent.
    const jwt = createEdDSAJWT(this._privateKey, this._lifetime, this._audience ?? audience);
    headers['Authorization'] = `Bearer ${jwt}`;
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
