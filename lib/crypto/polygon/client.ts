// ============================================================================
// Polygon Client
// Shared Polygon/EVM utilities for Polymarket and other EVM-based operations
// Uses viem for RPC operations, keeps ethers Wallet for Polymarket CLOB compat
// ============================================================================

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { POLYGON_RPC_URL, POLYGON_USDC_ADDRESS } from "@/lib/config";

/** Polygon mainnet chain ID */
export const POLYGON_CHAIN_ID = 137;

// ============================================================================
// Viem Clients
// ============================================================================

/**
 * Create a viem public client for read operations
 */
export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: polygon,
    transport: http(POLYGON_RPC_URL),
  });
}

/**
 * Create a viem wallet client for write operations
 */
export function getWalletClient(account: Account): WalletClient {
  return createWalletClient({
    chain: polygon,
    transport: http(POLYGON_RPC_URL),
    account,
  });
}

// ============================================================================
// Wallet Types - Polymarket CLOB Compatibility
// ============================================================================

/**
 * Minimal wallet interface that matches what Polymarket CLOB expects.
 * This allows us to use viem accounts while maintaining compatibility.
 */
export interface PolygonWallet {
  address: string;
  /** Get address (ethers v5 compat) - used by Polymarket CLOB */
  getAddress: () => Promise<string>;
  /** Sign typed data (EIP-712) - used by Polymarket CLOB */
  signTypedData: (
    domain: object,
    types: object,
    value: object
  ) => Promise<string>;
  /** Alias for signTypedData (ethers v5 compat) */
  _signTypedData: (
    domain: object,
    types: object,
    value: object
  ) => Promise<string>;
  /** Internal: viem account for direct operations */
  _viemAccount: Account;
}

/**
 * Create a Polygon wallet from a hex private key.
 * Returns a wallet compatible with both viem and Polymarket CLOB.
 *
 * @param privateKeyHex - Private key in hex format (with or without 0x prefix)
 * @returns Wallet instance compatible with Polymarket CLOB
 */
export function createPolygonWallet(privateKeyHex: string): PolygonWallet {
  const formattedKey = (
    privateKeyHex.startsWith("0x") ? privateKeyHex : `0x${privateKeyHex}`
  ) as `0x${string}`;

  const account = privateKeyToAccount(formattedKey);

  // Create wallet client for signing
  const walletClient = getWalletClient(account);

  // EIP-712 signTypedData implementation
  const signTypedData = async (
    domain: object,
    types: object,
    value: object
  ): Promise<string> => {
    // viem's signTypedData has a different signature
    const signature = await walletClient.signTypedData({
      account,
      domain: domain as Parameters<
        typeof walletClient.signTypedData
      >[0]["domain"],
      types: types as Parameters<typeof walletClient.signTypedData>[0]["types"],
      primaryType: Object.keys(types).find((k) => k !== "EIP712Domain") || "",
      message: value as Record<string, unknown>,
    });
    return signature;
  };

  return {
    address: account.address,
    getAddress: async () => account.address, // ethers v5 compat
    signTypedData,
    _signTypedData: signTypedData, // ethers v5 compat alias
    _viemAccount: account,
  };
}

/**
 * Get the default Polygon wallet from environment.
 * Falls back to PRIVATE_KEY if POLYGON_PRIVATE_KEY is not set.
 *
 * @returns Wallet instance compatible with Polymarket CLOB
 * @throws Error if no private key is configured
 */
export function getDefaultPolygonWallet(): PolygonWallet {
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

/** ERC20 ABI for balance and transfer operations */
const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

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
    const client = getPublicClient();

    const [rawBalance, decimals] = await Promise.all([
      client.readContract({
        address: POLYGON_USDC_ADDRESS as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as Address],
      }),
      client.readContract({
        address: POLYGON_USDC_ADDRESS as Address,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);

    const balance = Number(formatUnits(rawBalance, decimals));

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

// ============================================================================
// Native POL Balance
// ============================================================================

/**
 * Get native POL (MATIC) balance for an address on Polygon
 *
 * @param walletAddress - Wallet address to check
 * @returns Balance in POL (human-readable)
 */
export async function getPolBalance(walletAddress: string): Promise<{
  address: string;
  balance: number;
  rawBalance: bigint;
} | null> {
  try {
    const client = getPublicClient();
    const rawBalance = await client.getBalance({
      address: walletAddress as Address,
    });

    // Convert wei to POL (18 decimals)
    const balance = Number(formatUnits(rawBalance, 18));

    return {
      address: walletAddress,
      balance,
      rawBalance,
    };
  } catch (error) {
    console.error("[polygon/client] getPolBalance error:", error);
    return null;
  }
}

// ============================================================================
// USDC Transfer
// ============================================================================

export interface TransferResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Send USDC.e from a wallet to a destination address on Polygon
 *
 * @param wallet - Polygon wallet with USDC.e balance
 * @param destinationAddress - Recipient address
 * @param amountUSDC - Amount in USDC (human-readable, e.g., 100 for $100)
 * @returns Transfer result with transaction hash
 */
export async function sendUsdcPolygon(
  wallet: PolygonWallet,
  destinationAddress: string,
  amountUSDC: number
): Promise<TransferResult> {
  const logPrefix = "[polygon/client]";

  try {
    const publicClient = getPublicClient();
    const walletClient = getWalletClient(wallet._viemAccount);

    // Convert to raw amount (6 decimals for USDC)
    const amount = parseUnits(amountUSDC.toString(), 6);

    // Check balance first
    const balance = await publicClient.readContract({
      address: POLYGON_USDC_ADDRESS as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.address as Address],
    });

    if (balance < amount) {
      return {
        success: false,
        error: `Insufficient USDC.e balance. Have: ${formatUnits(
          balance,
          6
        )}, Need: ${amountUSDC}`,
      };
    }

    console.log(
      `${logPrefix} Sending $${amountUSDC} USDC.e to ${destinationAddress}`
    );

    // Send transfer transaction
    const hash = await walletClient.writeContract({
      account: wallet._viemAccount,
      chain: polygon,
      address: POLYGON_USDC_ADDRESS as Address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [destinationAddress as Address, amount],
    });

    console.log(`${logPrefix} Transaction sent: ${hash}`);

    // Wait for confirmation with timeout
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000, // 60 second timeout
    });

    console.log(
      `${logPrefix} Transaction confirmed in block ${receipt.blockNumber}`
    );

    return {
      success: true,
      txHash: hash,
    };
  } catch (error) {
    console.error(`${logPrefix} sendUsdcPolygon error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown transfer error",
    };
  }
}
