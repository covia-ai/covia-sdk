/**
 * Client-side UCAN minting for self-sovereign callers — the tokens a principal
 * signs with their OWN key (a venue cannot sign as the caller, so these have
 * no venue-op counterpart; venues only verify). Java parity:
 * covia-core `covia.grid.auth.UcanTokens`.
 *
 * All helpers return the JWT encoding — the transport form carried in the
 * `ucans` request array and relayed across cross-venue hops. Delegation chains
 * embed parent tokens as JWT strings in `prf`.
 */

import { sign } from '@noble/ed25519';
import { encodePublicKey } from './multikey';
import { getPublicKey } from './keys';
import { base64UrlEncode } from './jwt';

const encoder = new TextEncoder();

/** The ability that instructs a venue to relay a cross-venue hop as itself. */
export const VENUE_RELAY = 'venue/relay';

export interface UCANCapability { with: string; can: string }

/** The did:key DID for a private key. */
export function didFor(privateKey: Uint8Array): string {
  return `did:key:${encodePublicKey(getPublicKey(privateKey))}`;
}

/**
 * Mint a UCAN as an EdDSA JWT: `{iss, aud, att, exp[, prf]}` signed by
 * `privateKey` (iss = its did:key).
 *
 * @param privateKey 32-byte Ed25519 private key (the issuer)
 * @param audienceDID who receives the token (`aud`)
 * @param att capabilities delegated (empty array = pure identity token)
 * @param lifetimeSeconds validity window
 * @param proofs parent UCAN JWT strings (`prf`) for delegation chains
 */
export function createUCANJWT(
  privateKey: Uint8Array,
  audienceDID: string,
  att: UCANCapability[],
  lifetimeSeconds: number,
  proofs: string[] = [],
): string {
  const multikey = encodePublicKey(getPublicKey(privateKey));
  const nowSecs = Math.floor(Date.now() / 1000);
  const header = JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: multikey });
  const claims: Record<string, unknown> = {
    iss: `did:key:${multikey}`,
    aud: audienceDID,
    att,
    exp: nowSecs + lifetimeSeconds,
  };
  if (proofs.length) claims.prf = proofs;
  const signingInput =
    `${base64UrlEncode(encoder.encode(header))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`;
  const signature = sign(encoder.encode(signingInput), privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Mint an **identity token**: a UCAN with an EMPTY attenuation list, audienced
 * to `venueDID`. Pure proof of identity — it grants nothing, and being
 * audience-bound it is unusable at any other venue. Present it in the `ucans`
 * array; the venue accepts it as the caller identity on an
 * otherwise-unauthenticated transport (how identity crosses cross-venue
 * relays — COG-3 §6, COG-15).
 */
export function identityToken(privateKey: Uint8Array, venueDID: string, lifetimeSeconds = 300): string {
  return createUCANJWT(privateKey, venueDID, [], lifetimeSeconds);
}

/**
 * Mint an owner-signed (**self-sovereign**) grant: delegates `(with, can)` to
 * `audienceDID`, rooted by the signer. Because the root issuer is the resource
 * owner, the grant verifies on ANY venue hosting the data — no venue involved
 * in issuance.
 */
export function grant(
  ownerPrivateKey: Uint8Array,
  audienceDID: string,
  withResource: string,
  can: string,
  lifetimeSeconds: number,
): string {
  return createUCANJWT(ownerPrivateKey, audienceDID, [{ with: withResource, can }], lifetimeSeconds);
}

/**
 * Mint a **relay delegation**: instructs and authorises `venueDID` to make a
 * cross-venue hop authenticated as itself, exercising the caller's authority.
 * Carries the `venue/relay` instruction plus the substantive capabilities the
 * venue may exercise. The venue honours it only when its issuer is the
 * authenticated caller (COG-15).
 */
export function relayDelegation(
  privateKey: Uint8Array,
  venueDID: string,
  lifetimeSeconds: number,
  caps: UCANCapability[] = [],
): string {
  const att: UCANCapability[] = [{ with: didFor(privateKey), can: VENUE_RELAY }, ...caps];
  return createUCANJWT(privateKey, venueDID, att, lifetimeSeconds);
}
