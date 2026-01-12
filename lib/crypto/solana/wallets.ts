// ============================================================================
// Solana Signer Utilities
// Keypair/signer creation utilities using @solana/kit (Web3.js 2.0)
// ============================================================================

import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getBase58Encoder,
  type KeyPairSigner,
} from "@solana/kit";

// ============================================================================
// Base58-encoded Key Signers
// ============================================================================

/**
 * Create a KeyPairSigner from a base58-encoded secret key (64 bytes)
 * This is the format used by Solana CLI keypair files
 *
 * Note: In @solana/kit codec terminology:
 * - Encoder: string → bytes (encodes the string representation into bytes)
 * - Decoder: bytes → string (decodes bytes back to string representation)
 */
export async function createSignerFromBase58SecretKey(
  secretKeyBase58: string,
): Promise<KeyPairSigner> {
  const encoder = getBase58Encoder();
  const secretKeyBytes = encoder.encode(secretKeyBase58);
  return await createKeyPairSignerFromBytes(secretKeyBytes);
}

/**
 * Create a KeyPairSigner from a base58-encoded private key (32 bytes)
 */
export async function createSignerFromBase58PrivateKey(
  privateKeyBase58: string,
): Promise<KeyPairSigner> {
  const encoder = getBase58Encoder();
  const privateKeyBytes = encoder.encode(privateKeyBase58);
  return await createKeyPairSignerFromPrivateKeyBytes(privateKeyBytes);
}

// ============================================================================
// Raw Bytes Key Signers
// ============================================================================

/**
 * Create a KeyPairSigner from raw secret key bytes (64 bytes)
 */
export async function createSignerFromSecretKeyBytes(
  secretKeyBytes: Uint8Array,
): Promise<KeyPairSigner> {
  return await createKeyPairSignerFromBytes(secretKeyBytes);
}

/**
 * Create a KeyPairSigner from raw private key bytes (32 bytes)
 */
export async function createSignerFromPrivateKeyBytes(
  privateKeyBytes: Uint8Array,
): Promise<KeyPairSigner> {
  return await createKeyPairSignerFromPrivateKeyBytes(privateKeyBytes);
}
