// ============================================================================
// EVM (Polygon) Signer Factory
// Creates EVM signers for AiMo Network payments on Polygon
// ============================================================================

import { EvmClientSigner } from "@aimo.network/evm";
import { privateKeyToAccount } from "viem/accounts";

/** CAIP-2 chain ID for Polygon mainnet */
export const POLYGON_CHAIN_ID = "eip155:137";

/**
 * Create an EVM client signer from a hex-encoded private key.
 * Used for Polygon-based payments on AiMo Network.
 *
 * @param privateKeyHex - EVM private key in hex format (with or without 0x prefix)
 * @param chainId - CAIP-2 chain ID (defaults to Polygon mainnet)
 * @returns EvmClientSigner configured for the specified chain
 */
export function createEvmSigner(
  privateKeyHex: string,
  chainId: `${string}:${string}` = POLYGON_CHAIN_ID
): EvmClientSigner {
  // Ensure the private key has 0x prefix
  const formattedKey = privateKeyHex.startsWith("0x")
    ? (privateKeyHex as `0x${string}`)
    : (`0x${privateKeyHex}` as `0x${string}`);

  // Create viem account from private key
  const account = privateKeyToAccount(formattedKey);

  return new EvmClientSigner({
    signer: account,
    chainId,
  });
}
