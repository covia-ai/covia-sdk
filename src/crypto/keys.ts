/**
 * Ed25519 keypair generation and utility functions.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

// Configure @noble/ed25519 to use sha512 from @noble/hashes (required for sync API)
ed.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = sha512.create();
  for (const msg of m) h.update(msg);
  return h.digest();
};

/**
 * Generate a random Ed25519 keypair.
 * @returns Object with privateKey (32 bytes) and publicKey (32 bytes)
 */
export function generateKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = ed.utils.randomPrivateKey();
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
 */
export function hexToPrivateKey(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
