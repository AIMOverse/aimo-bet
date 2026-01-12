// ============================================================================
// Polygon Client
// Shared Polygon/EVM utilities for Polymarket and other EVM-based operations
// ============================================================================

import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { POLYGON_RPC_URL, POLYGON_USDC_ADDRESS } from "@/lib/config";

/** Polygon mainnet chain ID */
export const POLYGON_CHAIN_ID = 137;

// ============================================================================
// RPC Provider
// ============================================================================

/**
 * Create a Polygon JSON-RPC provider
 * Note: Creating per-request to support edge runtime (no global state)
 */
export function getPolygonProvider(): JsonRpcProvider {
  return new JsonRpcProvider(POLYGON_RPC_URL, POLYGON_CHAIN_ID);
}

// ============================================================================
// Wallet Creation with ethers v5 compatibility
// ============================================================================

/**
 * Add ethers v5 compatibility shim for _signTypedData.
 * The Polymarket CLOB client expects ethers v5's _signTypedData method,
 * but ethers v6 renamed it to signTypedData.
 */
function addV5Compatibility(wallet: Wallet): Wallet {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletWithShim = wallet as any;

  // Add _signTypedData as an alias for signTypedData (ethers v5 → v6 compat)
  if (!walletWithShim._signTypedData) {
    walletWithShim._signTypedData = wallet.signTypedData.bind(wallet);
  }

  return walletWithShim;
}

/**
 * Create an ethers Wallet from a hex private key.
 * Used for Polymarket CLOB and other Polygon operations.
 * Includes ethers v5 compatibility shim for _signTypedData.
 *
 * @param privateKeyHex - Private key in hex format (with or without 0x prefix)
 * @returns ethers Wallet instance with v5 compatibility
 */
export function createPolygonWallet(privateKeyHex: string): Wallet {
  const formattedKey = privateKeyHex.startsWith("0x")
    ? privateKeyHex
    : `0x${privateKeyHex}`;
  const wallet = new Wallet(formattedKey);
  return addV5Compatibility(wallet);
}

/**
 * Get the default Polygon wallet from environment.
 * Falls back to PRIVATE_KEY if POLYGON_PRIVATE_KEY is not set.
 * Includes ethers v5 compatibility shim for _signTypedData.
 *
 * @returns ethers Wallet instance with v5 compatibility
 * @throws Error if no private key is configured
 */
export function getDefaultPolygonWallet(): Wallet {
  const privateKey = process.env.POLYGON_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      "No Polygon private key configured. Set POLYGON_PRIVATE_KEY or PRIVATE_KEY environment variable."
    );
  }

  return createPolygonWallet(privateKey);
}

// ============================================================================
// USDC Balance
// ============================================================================

/** Minimal ERC20 ABI for balance queries */
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

/**
 * Get USDC.e balance for an address on Polygon
 *
 * @param address - Wallet address to check
 * @returns Balance in USDC (human-readable, 6 decimals)
 */
export async function getUsdcBalance(address: string): Promise<{
  address: string;
  balance: number;
  rawBalance: bigint;
  decimals: number;
} | null> {
  try {
    const provider = getPolygonProvider();
    const usdcContract = new Contract(
      POLYGON_USDC_ADDRESS,
      ERC20_ABI,
      provider
    );

    const [rawBalance, decimals] = await Promise.all([
      usdcContract.balanceOf(address) as Promise<bigint>,
      usdcContract.decimals() as Promise<number>,
    ]);

    // Convert BigInt to number safely (USDC has 6 decimals)
    const divisor = 10n ** BigInt(decimals);
    const balance =
      Number(rawBalance / divisor) +
      Number(rawBalance % divisor) / Number(divisor);

    return {
      address,
      balance,
      rawBalance,
      decimals,
    };
  } catch (error) {
    console.error("[polygon/client] getUsdcBalance error:", error);
    return null;
  }
}
