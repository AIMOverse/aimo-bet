// ============================================================================
// Prediction Market Position Retrieval
// Functions for fetching and identifying a user's prediction market positions
// Docs: https://pond.dflow.net/quickstart/user-prediction-positions
// ============================================================================

import { dflowMetadataFetch } from "@/lib/dflow/client";
import {
  assertResponseOk,
  getPositionTypeForMint,
  isWinningOutcome,
} from "@/lib/dflow/utils";
import { getTokenAccountsByProgram, PROGRAM_IDS } from "@/lib/solana/client";
import type {
  MarketAccounts,
  MarketData,
  PositionType,
  TokenAccount,
  UserPosition,
  UserPositionsResult,
} from "./types";

// Re-export types for convenience
export type {
  TokenAccount,
  MarketAccounts,
  MarketData,
  UserPosition,
  UserPositionsResult,
};

// ============================================================================
// Constants
// ============================================================================

/** Maximum addresses per filter_outcome_mints request */
const FILTER_BATCH_SIZE = 200;

// ============================================================================
// Step 1: Fetch User's Token Accounts
// ============================================================================

/**
 * Fetch all Token-2022 token accounts for a wallet
 * Filters to non-zero balances only
 *
 * @param wallet - Solana wallet address
 * @returns Array of token accounts with balances
 */
export async function fetchUserTokenAccounts(
  wallet: string,
): Promise<TokenAccount[]> {
  // Use the generalized solana client function
  return getTokenAccountsByProgram(wallet, PROGRAM_IDS.TOKEN_2022, true);
}

// ============================================================================
// Step 2: Filter for Prediction Market Tokens
// ============================================================================

/**
 * Filter token addresses to only prediction market outcome mints
 * Uses the /api/v1/filter_outcome_mints endpoint
 *
 * @param addresses - Array of token mint addresses
 * @returns Array of addresses that are prediction market outcome mints
 */
export async function filterOutcomeMints(
  addresses: string[],
): Promise<string[]> {
  if (addresses.length === 0) return [];

  const allOutcomeMints: string[] = [];

  // Process in batches (max 200 per request)
  for (let i = 0; i < addresses.length; i += FILTER_BATCH_SIZE) {
    const batch = addresses.slice(i, i + FILTER_BATCH_SIZE);

    try {
      const response = await dflowMetadataFetch("/filter_outcome_mints", {
        method: "POST",
        body: JSON.stringify({ addresses: batch }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "[retrieve] filter_outcome_mints error:",
          response.status,
          errorText,
        );
        continue;
      }

      const data = await response.json();

      if (data.outcomeMints && Array.isArray(data.outcomeMints)) {
        allOutcomeMints.push(...data.outcomeMints);
      }
    } catch (error) {
      console.error("[retrieve] filter_outcome_mints batch error:", error);
      // Continue with other batches
    }
  }

  return allOutcomeMints;
}

// ============================================================================
// Step 3: Fetch Market Details
// ============================================================================

/**
 * Fetch market details for outcome mints
 * Uses the /api/v1/markets/batch endpoint
 *
 * @param mints - Array of outcome mint addresses
 * @returns Map of mint address to market data
 */
export async function fetchMarketsByMints(
  mints: string[],
): Promise<Map<string, MarketData>> {
  const marketsByMint = new Map<string, MarketData>();

  if (mints.length === 0) return marketsByMint;

  const response = await dflowMetadataFetch("/markets/batch", {
    method: "POST",
    body: JSON.stringify({ mints }),
  });

  await assertResponseOk(response, "fetch markets batch");

  const data = await response.json();

  if (data.markets && Array.isArray(data.markets)) {
    for (const market of data.markets) {
      // Map by all mint addresses for efficient lookup
      for (const accountKey of Object.keys(market.accounts || {})) {
        const account = market.accounts[accountKey];
        if (account.yesMint) {
          marketsByMint.set(account.yesMint, market);
        }
        if (account.noMint) {
          marketsByMint.set(account.noMint, market);
        }
        if (account.marketLedger) {
          marketsByMint.set(account.marketLedger, market);
        }
      }
    }
  }

  return marketsByMint;
}

// ============================================================================
// Main Function: Get User Positions
// ============================================================================

/**
 * Get all prediction market positions for a user wallet
 *
 * This performs the 3-step flow:
 * 1. Fetch all token accounts from the wallet
 * 2. Filter to only prediction market outcome mints
 * 3. Fetch market details for each position
 *
 * @param wallet - Solana wallet address
 * @returns User positions with market details
 *
 * @example
 * ```typescript
 * const result = await getUserPositions("5KKsLVU6TcbVDK4BS6K1DGDxnh4Q9xjYJ8XaDCG5t8ht");
 * console.log(`Found ${result.count} positions`);
 * for (const position of result.positions) {
 *   console.log(`${position.positionType} on ${position.market?.title}: ${position.quantity}`);
 * }
 * ```
 */
export async function getUserPositions(
  wallet: string,
): Promise<UserPositionsResult> {
  console.log("[retrieve] getUserPositions for wallet:", wallet);

  // Step 1: Fetch all token accounts
  console.log("[retrieve] Step 1: Fetching token accounts...");
  const tokenAccounts = await fetchUserTokenAccounts(wallet);
  console.log(
    "[retrieve] Found",
    tokenAccounts.length,
    "token accounts with balance",
  );

  if (tokenAccounts.length === 0) {
    return {
      wallet,
      positions: [],
      count: 0,
      resolvedCount: 0,
      activeCount: 0,
    };
  }

  // Step 2: Filter to prediction market outcome mints
  console.log("[retrieve] Step 2: Filtering outcome mints...");
  const allMints = tokenAccounts.map((t) => t.mint);
  const outcomeMints = await filterOutcomeMints(allMints);
  console.log("[retrieve] Found", outcomeMints.length, "outcome mints");

  if (outcomeMints.length === 0) {
    return {
      wallet,
      positions: [],
      count: 0,
      resolvedCount: 0,
      activeCount: 0,
    };
  }

  // Step 3: Fetch market details
  console.log("[retrieve] Step 3: Fetching market details...");
  const marketsByMint = await fetchMarketsByMints(outcomeMints);
  console.log("[retrieve] Fetched", marketsByMint.size, "market mappings");

  // Build position objects
  const tokenBalanceMap = new Map(
    tokenAccounts.map((t) => [
      t.mint,
      { balance: t.balance, decimals: t.decimals },
    ]),
  );

  const positions: UserPosition[] = [];
  let resolvedCount = 0;
  let activeCount = 0;

  for (const mint of outcomeMints) {
    const tokenInfo = tokenBalanceMap.get(mint);
    const marketData = marketsByMint.get(mint) || null;

    // Determine position type using shared utility
    const positionType: PositionType = marketData
      ? getPositionTypeForMint(mint, marketData.accounts)
      : "UNKNOWN";

    const position: UserPosition = {
      mint,
      quantity: tokenInfo?.balance ?? 0,
      decimals: tokenInfo?.decimals ?? 6,
      positionType,
      market: marketData,
    };

    positions.push(position);

    // Count by status
    if (marketData?.result) {
      resolvedCount++;
    } else if (marketData?.status === "active") {
      activeCount++;
    }
  }

  console.log("[retrieve] Returning", positions.length, "positions");

  return {
    wallet,
    positions,
    count: positions.length,
    resolvedCount,
    activeCount,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get only active (unresolved) positions for a wallet
 */
export async function getActivePositions(
  wallet: string,
): Promise<UserPosition[]> {
  const result = await getUserPositions(wallet);
  return result.positions.filter(
    (p) => p.market?.status === "active" && !p.market?.result,
  );
}

/**
 * Get only resolved positions (markets with results)
 */
export async function getResolvedPositions(
  wallet: string,
): Promise<UserPosition[]> {
  const result = await getUserPositions(wallet);
  return result.positions.filter((p) => p.market?.result);
}

/**
 * Get positions for a specific market ticker
 */
export async function getPositionsByMarket(
  wallet: string,
  marketTicker: string,
): Promise<UserPosition[]> {
  const result = await getUserPositions(wallet);
  return result.positions.filter((p) => p.market?.ticker === marketTicker);
}

/**
 * Calculate total position value given current prices
 * Note: Requires fetching live data separately
 *
 * @param positions - Array of user positions
 * @param priceByMint - Map of mint address to current price (0-1)
 * @returns Total value in the quote currency
 */
export function calculatePositionValue(
  positions: UserPosition[],
  priceByMint: Map<string, number>,
): number {
  let totalValue = 0;

  for (const position of positions) {
    const price = priceByMint.get(position.mint) ?? 0;
    totalValue += position.quantity * price;
  }

  return totalValue;
}

/**
 * Check if a position is winning (for resolved markets)
 *
 * @param position - The user position
 * @returns true if the position outcome matches the market result
 */
export function isWinningPosition(position: UserPosition): boolean | null {
  if (!position.market?.result) {
    return null; // Market not resolved
  }

  if (position.positionType === "UNKNOWN") {
    return null;
  }

  return isWinningOutcome(position.market.result, position.positionType);
}
