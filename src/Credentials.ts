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
  /** Apply authentication credentials to request headers (mutates in place). */
  abstract apply(headers: Record<string, string>): void;
}

/** No-op authentication provider. Sends no credentials. */
export class NoAuth extends Auth {
  apply(_headers: Record<string, string>): void {
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

  apply(headers: Record<string, string>): void {
    headers["Authorization"] = `Bearer ${this._token}`;
  }
}

/**
 * Ed25519 keypair authentication (self-issued EdDSA JWT).
 * Generates a fresh short-lived JWT for every request, signed with the
 * client's Ed25519 private key.  The server verifies the signature and
 * extracts the caller's DID from the `sub` claim.
 *
 * Example:
 *   const auth = KeyPairAuth.generate();
 *   console.log(auth.getDID()); // did:key:z6Mk...
 *   const venue = await Grid.connect("https://venue.covia.ai", auth);
 */
export class KeyPairAuth extends Auth {
  private _privateKey: Uint8Array;
  private _publicKey: Uint8Array;
  private _did: string;
  private _lifetime: number;

  /**
   * @param privateKey - 32-byte Ed25519 private key
   * @param tokenLifetimeSeconds - JWT lifetime in seconds (default 300 = 5 min)
   */
  constructor(privateKey: Uint8Array, tokenLifetimeSeconds: number = 300) {
    super();
    // Lazy imports to avoid top-level side effects for consumers that don't use KeyPairAuth
    const { getPublicKey } = require('./crypto/keys');
    const { didFromPublicKey } = require('./crypto/multikey');
    this._privateKey = privateKey;
    this._publicKey = getPublicKey(privateKey);
    this._did = didFromPublicKey(this._publicKey);
    this._lifetime = tokenLifetimeSeconds;
  }

  apply(headers: Record<string, string>): void {
    const { createEdDSAJWT } = require('./crypto/jwt');
    const jwt = createEdDSAJWT(this._privateKey, this._lifetime);
    headers['Authorization'] = `Bearer ${jwt}`;
  }

  /** The caller's DID derived from the public key. */
  getDID(): string {
    return this._did;
  }

  /** The 32-byte Ed25519 public key. */
  getPublicKey(): Uint8Array {
    return this._publicKey;
  }

  /** Generate a new random keypair and return a KeyPairAuth instance. */
  static generate(tokenLifetimeSeconds: number = 300): KeyPairAuth {
    const { generateKeyPair } = require('./crypto/keys');
    const { privateKey } = generateKeyPair();
    return new KeyPairAuth(privateKey, tokenLifetimeSeconds);
  }

  /** Create from a hex-encoded private key string. */
  static fromHex(privateKeyHex: string, tokenLifetimeSeconds: number = 300): KeyPairAuth {
    const { hexToPrivateKey } = require('./crypto/keys');
    return new KeyPairAuth(hexToPrivateKey(privateKeyHex), tokenLifetimeSeconds);
  }
}

/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, KeyPairAuth). */
export interface Credentials {
  venueId: string;
  apiKey: string;
  userId: string;
}

/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, KeyPairAuth). */
export class CredentialsHTTP implements Credentials {
  constructor(public venueId: string, public apiKey: string, public userId: string) {}
}
