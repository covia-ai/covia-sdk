/**
 * Ed25519 signers: the key-holding half of every signing path, abstracted so
 * the private key need not be readable bytes.
 *
 * A {@link rawKeySigner} wraps a 32-byte key (the classic path). A
 * {@link webCryptoSigner} wraps a WebCrypto `CryptoKeyPair` whose private key
 * can be **non-extractable**: it signs, but no script can read it back as
 * bytes, and it persists in IndexedDB as a structured-cloneable `CryptoKey`.
 * WebCrypto signing is async, so the {@link Ed25519Signer} contract is too.
 *
 * Ed25519 is deterministic (RFC 8032): the same key and message give the same
 * signature on either path, so tokens are identical whichever signer made them.
 */

import { sign } from '@noble/ed25519';
import { getPublicKey } from './keys';

/** Signs with an Ed25519 key that may not be readable as bytes. */
export interface Ed25519Signer {
  /** 32-byte raw public key. */
  readonly publicKey: Uint8Array;
  /** Ed25519 signature (64 bytes) over `data`. */
  sign(data: Uint8Array): Promise<Uint8Array>;
}

const ED25519 = 'Ed25519';

// PKCS#8 wrapper for a 32-byte Ed25519 seed (RFC 8410): WebCrypto imports
// Ed25519 private keys as pkcs8 or jwk, never as raw bytes.
const PKCS8_ED25519_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new Error('WebCrypto is unavailable: crypto.subtle requires a secure context (HTTPS or localhost)');
  }
  return s;
}

// Copy into a fresh ArrayBuffer-backed view: WebCrypto's BufferSource type
// rejects views over SharedArrayBuffer-typed (ArrayBufferLike) buffers.
function bytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data);
}

/** A signer over a raw 32-byte private key (synchronous @noble signing underneath). */
export function rawKeySigner(privateKey: Uint8Array): Ed25519Signer {
  const publicKey = getPublicKey(privateKey);
  return {
    publicKey,
    sign: (data) => Promise.resolve(sign(data, privateKey)),
  };
}

/**
 * A signer over a WebCrypto Ed25519 keypair. The private key may be (and
 * normally should be) non-extractable; the public key always is exportable.
 */
export async function webCryptoSigner(keyPair: CryptoKeyPair): Promise<Ed25519Signer> {
  const publicKey = new Uint8Array(await subtle().exportKey('raw', keyPair.publicKey));
  const privateKey = keyPair.privateKey;
  return {
    publicKey,
    sign: async (data) => new Uint8Array(await subtle().sign(ED25519, privateKey, bytes(data))),
  };
}

/** Generate a WebCrypto Ed25519 keypair whose private key cannot be exported. */
export async function generateNonExtractableKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(ED25519, false, ['sign', 'verify']);
}

/**
 * Import an existing 32-byte private key as a non-extractable WebCrypto
 * keypair — the one-time migration from a stored hex/raw key. The DID is
 * unchanged. The caller should delete its own copy of the raw key afterwards.
 */
export async function importNonExtractableKey(privateKey: Uint8Array): Promise<CryptoKeyPair> {
  if (privateKey.length !== 32) {
    throw new Error('Invalid Ed25519 private key: expected 32 bytes');
  }
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
  pkcs8.set(PKCS8_ED25519_PREFIX, 0);
  pkcs8.set(privateKey, PKCS8_ED25519_PREFIX.length);
  try {
    const s = subtle();
    const [priv, pub] = await Promise.all([
      s.importKey('pkcs8', pkcs8, ED25519, false, ['sign']),
      s.importKey('raw', bytes(getPublicKey(privateKey)), ED25519, true, ['verify']),
    ]);
    return { privateKey: priv, publicKey: pub };
  } finally {
    pkcs8.fill(0);
  }
}

let supported: Promise<boolean> | undefined;

/**
 * Whether this runtime can sign with WebCrypto Ed25519 (current Chrome,
 * Firefox, Safari 17+ and Node). Apps without it fall back to a raw-key
 * signer. Probed once, by generating and signing with a throwaway key.
 */
export function isWebCryptoEd25519Supported(): Promise<boolean> {
  supported ??= (async () => {
    try {
      const kp = await generateNonExtractableKeyPair();
      await subtle().sign(ED25519, kp.privateKey, new Uint8Array(1));
      return true;
    } catch {
      return false;
    }
  })();
  return supported;
}
