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
// Wallet Creation
// ============================================================================

/**
 * Create an ethers Wallet from a hex private key.
 * Used for Polymarket CLOB and other Polygon operations.
 *
 * @param privateKeyHex - Private key in hex format (with or without 0x prefix)
 * @returns ethers Wallet instance
 */
export function createPolygonWallet(privateKeyHex: string): Wallet {
  const formattedKey = privateKeyHex.startsWith("0x")
    ? privateKeyHex
    : `0x${privateKeyHex}`;
  return new Wallet(formattedKey);
}

/**
 * Get the default Polygon wallet from environment.
 * Falls back to PRIVATE_KEY if POLYGON_PRIVATE_KEY is not set.
 *
 * @returns ethers Wallet instance
 * @throws Error if no private key is configured
 */
export function getDefaultPolygonWallet(): Wallet {
  const privateKey = process.env.POLYGON_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      "No Polygon private key configured. Set POLYGON_PRIVATE_KEY or PRIVATE_KEY environment variable.",
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
    const usdcContract = new Contract(POLYGON_USDC_ADDRESS, ERC20_ABI, provider);

    const [rawBalance, decimals] = await Promise.all([
      usdcContract.balanceOf(address) as Promise<bigint>,
      usdcContract.decimals() as Promise<number>,
    ]);

    const balance = Number(rawBalance) / Math.pow(10, decimals);

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
