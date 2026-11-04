import {
  AuthenticationKeysResult,
  AuthenticatorRevokeResult,
  NotFoundError,
  OperationRunner,
  StatusData,
  UnsupportedVenueFeatureError,
  UserDeleteResult,
  UserInfo,
  UserListResult,
} from './types';
import { venueJson, VenueRequestContext } from './VenueTransport';
import { ROUTE_MISSING_404 } from './venue-features';

interface UserManagerVenue extends VenueRequestContext {
  operations: OperationRunner;
  lastKnownStatus?: StatusData;
}

export class UserManager {
  // Whether this venue serves GET /api/v1/users — flipped on a route-missing
  // 404 so a pre-#255 venue pays the probe once, not one failed GET per read.
  private usersSupported = true;

  constructor(private venue: UserManagerVenue) {}

  /** A job-free users GET that rejects when the endpoint is unavailable. */
  private async usersGet<T>(path: string): Promise<T> {
    if (!this.usersSupported) throw new UnsupportedVenueFeatureError('venue users');
    try {
      return await venueJson<T>(this.venue, `/api/v1/users${path}`);
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
      // Not every 404 means "route missing" — GET /users/{did} 404s for a
      // user that just isn't registered too. Only the bare list route (no
      // per-resource 404 possible) or the distinctive unmapped-endpoint body
      // proves the route itself is absent; a per-resource 404 must propagate
      // to the caller (see AgentManager, covia#180, for why this matters).
      const routeMissing = path === '' || ROUTE_MISSING_404.test(e.message);
      if (!routeMissing) throw e;
      this.usersSupported = false;
      throw new UnsupportedVenueFeatureError('venue users');
    }
  }

  /**
   * List registered venue users. **Job-free** on covia venues serving
   * `GET /api/v1/users` (covia#255) — synchronous, no Job persisted.
   * Operator-only: throws a `GridError` with `statusCode` 403 for a
   * signed-in caller that is not the venue itself and holds no venue-issued
   * delegation over `<venueDID>/users` — that is an expected, common
   * outcome to branch on, not a bug.
   */
  async list(): Promise<UserListResult> {
    return this.usersGet<UserListResult>('');
  }

  /**
   * Get one registered user. The caller's own DID needs no operator
   * authority; any other DID does (403 otherwise).
   */
  async info(did: string): Promise<UserInfo> {
    return this.usersGet<UserInfo>(`/${encodeURIComponent(did)}`);
  }

  /**
   * List a venue-managed user's authenticators, active and revoked
   * tombstones alike — revocation is a status transition in place, never a
   * deletion. The caller's own DID needs no operator authority; any other
   * DID does (403 otherwise).
   */
  async listAuthenticators(did: string): Promise<AuthenticationKeysResult> {
    return this.usersGet<AuthenticationKeysResult>(`/${encodeURIComponent(did)}/authentications`);
  }

  /**
   * Revoke one of a venue-managed user's authenticators. A mutation, so —
   * unlike the reads above — this goes through `operations.run` and mints a
   * Job, matching every other write in this SDK (e.g. `SecretManager.set`).
   */
  async revokeAuthenticator(key: string, did?: string, ucans?: string[]): Promise<AuthenticatorRevokeResult> {
    return this.venue.operations.run<AuthenticatorRevokeResult>(
      'v/ops/user/authentication-revoke', { did, key }, { ucans },
    );
  }

  /**
   * Delete a venue account (covia#536): its profile, login aliases and
   * namespace, with its jobs, agents and schedules cancelled.
   *
   * **Operator-authorised, not self-service.** The caller needs venue-issued
   * `user/delete` authority on `<venueDID>/users`, even to delete their own
   * account; pass a delegation as `ucans` if the caller's own identity doesn't
   * carry it. Without it the venue fails the Job ("Venue administration
   * denied: requires user/delete …"), which surfaces as a `JobFailedError`,
   * not an HTTP 403.
   *
   * Idempotent: deleting an account that is still absent returns the original
   * deletion record. Deletion is not a ban: the venue's normal admission policy
   * can later create a new, empty account under the same DID, and the old
   * venue-managed authentication keys stay revoked.
   *
   * This is logical removal. Physical erasure waits for the venue to collect
   * unreferenced data and for retained checkpoints, backups and external
   * copies to expire; neither is implied by this call.
   *
   * A mutation, so it goes through `operations.run` (`v/ops/user/delete`) and
   * mints a Job, like `revokeAuthenticator`. That path carries `ucans` in the
   * request body; the venue's `DELETE /api/v1/users/{did}` route does not.
   */
  async delete(did: string, ucans?: string[]): Promise<UserDeleteResult> {
    return this.venue.operations.run<UserDeleteResult>('v/ops/user/delete', { did }, { ucans });
  }
}
