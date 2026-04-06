/**
 * Multikey encoding for Ed25519 public keys.
 * Follows the did:key spec with multicodec prefix 0xed01 for Ed25519.
 */

import { encode, decode } from './base58';

/** Multicodec prefix for Ed25519 public keys. */
const ED25519_PREFIX = new Uint8Array([0xed, 0x01]);

/**
 * Encode an Ed25519 public key as a multikey string (z-prefixed base58-btc).
 * @param publicKey - 32-byte Ed25519 public key
 * @returns Multikey string like "z6MkhaXgBZD..."
 */
export function encodePublicKey(publicKey: Uint8Array): string {
  const prefixed = new Uint8Array(2 + publicKey.length);
  prefixed.set(ED25519_PREFIX, 0);
  prefixed.set(publicKey, 2);
  return 'z' + encode(prefixed);
}

/**
 * Decode a multikey string back to a 32-byte Ed25519 public key.
 * @param multikey - Multikey string starting with "z"
 * @returns 32-byte Ed25519 public key
 */
export function decodePublicKey(multikey: string): Uint8Array {
  if (!multikey.startsWith('z')) {
    throw new Error('Multikey must start with "z"');
  }
  const decoded = decode(multikey.slice(1));
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Invalid Ed25519 multikey prefix');
  }
  return decoded.slice(2);
}

/**
 * Create a did:key DID from an Ed25519 public key.
 * @param publicKey - 32-byte Ed25519 public key
 * @returns DID string like "did:key:z6MkhaXgBZD..."
 */
export function didFromPublicKey(publicKey: Uint8Array): string {
  return `did:key:${encodePublicKey(publicKey)}`;
}
