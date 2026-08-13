/**
 * Ed25519 keypair generation and utility functions.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Wire @noble/ed25519's synchronous API to a SHA-512 implementation.
// v3 reads the sync hash from `hashes.sha512` (was `etc.sha512Sync` in v2).
ed.hashes.sha512 = sha512;

/**
 * Generate a random Ed25519 keypair.
 * @returns Object with privateKey (32 bytes) and publicKey (32 bytes)
 */
export function generateKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Derive the public key from a private key.
 * @param privateKey - 32-byte Ed25519 private key
 * @returns 32-byte Ed25519 public key
 */
export function getPublicKey(privateKey: Uint8Array): Uint8Array {
  return ed.getPublicKey(privateKey);
}

/**
 * Convert a private key to hex string for storage.
 */
export function privateKeyToHex(key: Uint8Array): string {
  return Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert a hex string back to a private key Uint8Array.
 *
 * Strict by design: this is an identity primitive that round-trips through
 * storage, and lax parsing would turn a corrupted stored key into a
 * *different valid key* (a new DID) with no error. Accepts exactly 64 hex
 * chars, with an optional `0x` prefix.
 */
export function hexToPrivateKey(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error('Invalid Ed25519 private key: expected 64 hex characters (32 bytes)');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
