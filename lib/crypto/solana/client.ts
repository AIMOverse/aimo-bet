// ============================================================================
// Solana RPC Client
// Using @solana/kit (Web3.js 2.0) for type-safe Solana interactions
// Docs: https://www.solanakit.com
// ============================================================================

import { createSolanaRpc, address, type Address } from "@solana/kit";
import { SOLANA_RPC_URL } from "@/lib/config";

// ============================================================================
// RPC Client Setup
// ============================================================================

/**
 * Create a Solana RPC client
 * Note: Creating per-request to support edge runtime (no global state)
 */
export function getRpc() {
  return createSolanaRpc(SOLANA_RPC_URL);
}

// ============================================================================
// Well-known Token Mints
// ============================================================================

export const TOKEN_MINTS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  CASH: "CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT",
} as const;

export type SupportedCurrency = keyof typeof TOKEN_MINTS;

// ============================================================================
// Well-known Program IDs
// ============================================================================

export const PROGRAM_IDS = {
  /** Token-2022 Program (used by prediction market tokens) */
  TOKEN_2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  /** Original SPL Token Program */
  TOKEN: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
} as const;

export type ProgramId = keyof typeof PROGRAM_IDS;

// ============================================================================
// getBalance - Get native SOL balance
// https://solana.com/developers/cookbook/accounts/get-account-balance
// ============================================================================

/**
 * Get native SOL balance for an account (in lamports)
 * @param wallet - Wallet address string
 * @returns Balance in lamports, or null on error
 */
export async function getBalance(wallet: string): Promise<bigint | null> {
  try {
    const rpc = getRpc();
    const { value } = await rpc.getBalance(address(wallet)).send();
    return value;
  } catch (error) {
    console.error("[solana/client] getBalance error:", error);
    return null;
  }
}

/**
 * Get native SOL balance formatted
 * @param wallet - Wallet address string
 * @returns Balance object with lamports and SOL amount
 */
export async function getSolBalance(wallet: string): Promise<{
  lamports: bigint;
  sol: string;
} | null> {
  const lamports = await getBalance(wallet);
  if (lamports === null) return null;

  return {
    lamports,
    sol: (Number(lamports) / 1_000_000_000).toFixed(9),
  };
}

// ============================================================================
// getTokenAccountBalance - Get SPL token balance
// https://solana.com/developers/cookbook/tokens/get-token-balance
// ============================================================================

export interface TokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

/**
 * Get token balance for a specific token account (ATA)
 * @param tokenAccount - The token account address (not wallet address)
 * @returns Token balance info, or null on error
 */
export async function getTokenAccountBalance(
  tokenAccount: string
): Promise<TokenAmount | null> {
  try {
    const rpc = getRpc();
    const { value } = await rpc
      .getTokenAccountBalance(address(tokenAccount))
      .send();

    return {
      amount: value.amount,
      decimals: value.decimals,
      uiAmount: value.uiAmount ?? null,
      uiAmountString: value.uiAmountString ?? "0",
    };
  } catch (error) {
    console.error("[solana/client] getTokenAccountBalance error:", error);
    return null;
  }
}

// ============================================================================
// getTokenAccountsByOwner - Find token accounts by owner and mint
// ============================================================================

export interface TokenAccountInfo {
  pubkey: string;
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
  uiAmount: number | null;
}

/**
 * Get all token accounts for a wallet filtered by mint
 * @param owner - Wallet address
 * @param mint - Token mint address
 * @returns Array of token account info, or null on error
 */
export async function getTokenAccountsByOwner(
  owner: string,
  mint: string
): Promise<TokenAccountInfo[] | null> {
  try {
    const rpc = getRpc();
    const { value } = await rpc
      .getTokenAccountsByOwner(
        address(owner),
        { mint: address(mint) },
        { encoding: "jsonParsed" }
      )
      .send();

    return value.map((account) => {
      const parsed = account.account.data.parsed;
      const info = parsed.info;
      return {
        pubkey: account.pubkey,
        mint: info.mint,
        owner: info.owner,
        amount: info.tokenAmount.amount,
        decimals: info.tokenAmount.decimals,
        uiAmount: info.tokenAmount.uiAmount ?? null,
      };
    });
  } catch (error) {
    console.error("[solana/client] getTokenAccountsByOwner error:", error);
    return null;
  }
}

// ============================================================================
// getTokenAccountsByProgram - Get all token accounts for a program
// ============================================================================

/** Token account with balance info (used by getTokenAccountsByProgram) */
export interface TokenAccountWithBalance {
  mint: string;
  rawBalance: string;
  balance: number;
  decimals: number;
}

/**
 * Get all token accounts for a wallet filtered by token program
 * Useful for fetching Token-2022 accounts (e.g., prediction market tokens)
 *
 * @param owner - Wallet address
 * @param programId - Token program ID (defaults to TOKEN_2022)
 * @param nonZeroOnly - If true, only return accounts with non-zero balance (default: true)
 * @returns Array of token accounts with balances
 */
export async function getTokenAccountsByProgram(
  owner: string,
  programId: string = PROGRAM_IDS.TOKEN_2022,
  nonZeroOnly: boolean = true
): Promise<TokenAccountWithBalance[]> {
  try {
    const rpc = getRpc();

    const { value: accounts } = await rpc
      .getTokenAccountsByOwner(
        address(owner),
        { programId: address(programId) },
        { encoding: "jsonParsed" }
      )
      .send();

    const tokenAccounts: TokenAccountWithBalance[] = [];

    for (const account of accounts) {
      const parsed = account.account.data.parsed;
      const info = parsed.info;
      const balance = info.tokenAmount.uiAmount ?? 0;

      // Filter non-zero balances if requested
      if (nonZeroOnly && balance <= 0) {
        continue;
      }

      tokenAccounts.push({
        mint: info.mint,
        rawBalance: info.tokenAmount.amount,
        balance,
        decimals: info.tokenAmount.decimals,
      });
    }

    return tokenAccounts;
  } catch (error) {
    console.error("[solana/client] getTokenAccountsByProgram error:", error);
    throw new Error(
      `Failed to fetch token accounts: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Get total token balance for a wallet (sums all accounts for a mint)
 * @param owner - Wallet address
 * @param mint - Token mint address
 * @returns Aggregated balance info
 */
export async function getTokenBalanceByOwner(
  owner: string,
  mint: string
): Promise<{
  amount: bigint;
  decimals: number;
  formatted: string;
} | null> {
  const accounts = await getTokenAccountsByOwner(owner, mint);
  if (accounts === null) return null;

  if (accounts.length === 0) {
    return { amount: BigInt(0), decimals: 6, formatted: "0.00" };
  }

  let totalAmount = BigInt(0);
  let decimals = 6;

  for (const account of accounts) {
    totalAmount += BigInt(account.amount);
    decimals = account.decimals;
  }

  const formatted = (Number(totalAmount) / Math.pow(10, decimals)).toFixed(2);

  return { amount: totalAmount, decimals, formatted };
}

// ============================================================================
// Convenience: Get balance by currency name
// ============================================================================

/**
 * Get token balance for a supported currency (USDC, CASH)
 * @param owner - Wallet address
 * @param currency - Currency name (USDC, CASH)
 * @returns Balance info with currency metadata
 */
export async function getCurrencyBalance(
  owner: string,
  currency: SupportedCurrency
): Promise<{
  wallet: string;
  currency: SupportedCurrency;
  mint: string;
  amount: bigint;
  decimals: number;
  formatted: string;
} | null> {
  const mint = TOKEN_MINTS[currency];
  if (!mint) return null;

  const balance = await getTokenBalanceByOwner(owner, mint);
  if (balance === null) return null;

  return {
    wallet: owner,
    currency,
    mint,
    ...balance,
  };
}
