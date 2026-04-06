/**
 * EdDSA JWT creation for self-issued authentication.
 * Produces JWTs compatible with Covia server's AuthMiddleware.
 */

import { sign } from '@noble/ed25519';
import { encodePublicKey } from './multikey';
import { getPublicKey } from './keys';

const encoder = new TextEncoder();

/**
 * Base64url encode bytes (no padding), per RFC 7515.
 */
export function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Create and sign an EdDSA JWT for self-issued authentication.
 *
 * Header:  {"alg":"EdDSA","typ":"JWT","kid":"<multikey>"}
 * Payload: {"sub":"did:key:<multikey>","iss":"did:key:<multikey>","iat":<now>,"exp":<now+lifetime>}
 *
 * @param privateKey - 32-byte Ed25519 private key
 * @param lifetimeSeconds - Token lifetime in seconds (default 300)
 * @returns Signed JWT string
 */
export function createEdDSAJWT(privateKey: Uint8Array, lifetimeSeconds: number = 300): string {
  const publicKey = getPublicKey(privateKey);
  const multikey = encodePublicKey(publicKey);
  const did = `did:key:${multikey}`;

  const nowSecs = Math.floor(Date.now() / 1000);

  const header = JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: multikey });
  const payload = JSON.stringify({
    sub: did,
    iss: did,
    iat: nowSecs,
    exp: nowSecs + lifetimeSeconds,
  });

  const headerB64 = base64UrlEncode(encoder.encode(header));
  const payloadB64 = base64UrlEncode(encoder.encode(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = sign(encoder.encode(signingInput), privateKey);
  const signatureB64 = base64UrlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}
