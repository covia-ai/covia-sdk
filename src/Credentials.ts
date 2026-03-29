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
 * HTTP Basic authentication.
 * Adds `Authorization: Basic <base64(username:password)>` to every request.
 *
 * **Warning:** The Covia venue server does not support Basic authentication.
 * Use {@link BearerAuth} with a JWT token instead for authenticated requests.
 */
export class BasicAuth extends Auth {
  private _encoded: string;

  constructor(username: string, password: string) {
    super();
    this._encoded = btoa(`${username}:${password}`);
  }

  apply(headers: Record<string, string>): void {
    headers["Authorization"] = `Basic ${this._encoded}`;
  }
}

/**
 * Custom auth that sets the X-Covia-User header for user identity tracking.
 *
 * **Warning:** The Covia venue server does not process the X-Covia-User header
 * for authentication. Requests using this auth type will be treated as
 * unauthenticated. Use {@link BearerAuth} with a JWT token instead.
 */
export class CoviaUserAuth extends Auth {
  private _userId: string;

  constructor(userId: string) {
    super();
    this._userId = userId;
  }

  apply(headers: Record<string, string>): void {
    if (this._userId && this._userId !== "") {
      headers["X-Covia-User"] = this._userId;
    }
  }
}

/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, BasicAuth, CoviaUserAuth). */
export interface Credentials {
  venueId: string;
  apiKey: string;
  userId: string;
}

/** @deprecated Use Auth subclasses instead (NoAuth, BearerAuth, BasicAuth, CoviaUserAuth). */
export class CredentialsHTTP implements Credentials {
  constructor(public venueId: string, public apiKey: string, public userId: string) {}
}
