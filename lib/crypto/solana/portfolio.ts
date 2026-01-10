/**
 * Portfolio Value Calculator
 *
 * Calculates total portfolio value for an agent by summing:
 * 1. USDC balance (cash)
 * 2. Prediction market positions × current prices
 *
 * Uses DFlow Metadata API for position identification and pricing.
 */

import { SOLANA_RPC_URL, DFLOW_METADATA_API_URL } from "@/lib/config";
import {
  getCurrencyBalance,
  getTokenAccountsByProgram,
  PROGRAM_IDS,
  type TokenAccountWithBalance,
} from "./client";

// ============================================================================
// Types
// ============================================================================

export interface Position {
  /** Token mint address */
  mint: string;
  /** Market ticker (e.g., "TRUMP-2024") */
  marketTicker: string;
  /** Market title */
  marketTitle?: string;
  /** Position side: YES or NO */
  side: "yes" | "no";
  /** Number of tokens held */
  quantity: number;
  /** Current price per token (0-1) */
  currentPrice: number;
  /** Position value in USDC (quantity × price) */
  value: number;
  /** Market status */
  marketStatus?: string;
}

export interface PortfolioSnapshot {
  /** Wallet address */
  wallet: string;
  /** Timestamp of snapshot */
  timestamp: Date;
  /** USDC (cash) balance */
  usdcBalance: number;
  /** Total value of all positions */
  positionsValue: number;
  /** Total portfolio value (usdc + positions) */
  totalValue: number;
  /** Individual positions */
  positions: Position[];
}

// ============================================================================
// DFlow API Types
// ============================================================================

interface OutcomeMint {
  mint: string;
  marketTicker: string;
}

interface MarketAccount {
  yesMint: string;
  noMint: string;
  marketLedger: string;
}

interface MarketData {
  ticker: string;
  title: string;
  status: string;
  yesPrice?: number;
  noPrice?: number;
  accounts: Record<string, MarketAccount>;
}

// ============================================================================
// Position Fetching
// ============================================================================

/**
 * Filter token mints to identify prediction market outcome tokens
 */
async function filterOutcomeMints(mints: string[]): Promise<OutcomeMint[]> {
  if (mints.length === 0) return [];

  try {
    const response = await fetch(
      `${DFLOW_METADATA_API_URL}/api/v1/filter_outcome_mints`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: mints }),
      }
    );

    if (!response.ok) {
      console.error("[portfolio] filter_outcome_mints error:", response.status);
      return [];
    }

    const data = await response.json();
    return data.outcomeMints || [];
  } catch (error) {
    console.error("[portfolio] Failed to filter outcome mints:", error);
    return [];
  }
}

/**
 * Fetch market details for outcome tokens in batch
 */
async function fetchMarketsBatch(
  mints: string[]
): Promise<Map<string, MarketData>> {
  if (mints.length === 0) return new Map();

  try {
    const response = await fetch(
      `${DFLOW_METADATA_API_URL}/api/v1/markets/batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mints }),
      }
    );

    if (!response.ok) {
      console.error("[portfolio] markets/batch error:", response.status);
      return new Map();
    }

    const data = await response.json();
    const markets = data.markets || [];

    // Create lookup map by mint address
    const marketsByMint = new Map<string, MarketData>();
    for (const market of markets as MarketData[]) {
      if (market.accounts) {
        for (const account of Object.values(market.accounts)) {
          if (account.yesMint) marketsByMint.set(account.yesMint, market);
          if (account.noMint) marketsByMint.set(account.noMint, market);
        }
      }
    }

    return marketsByMint;
  } catch (error) {
    console.error("[portfolio] Failed to fetch markets batch:", error);
    return new Map();
  }
}

/**
 * Fetch all prediction market positions for a wallet
 */
export async function getPositions(wallet: string): Promise<Position[]> {
  // Step 1: Get all Token-2022 accounts (prediction market tokens use Token-2022)
  const tokenAccounts = await getTokenAccountsByProgram(
    wallet,
    PROGRAM_IDS.TOKEN_2022,
    true // non-zero only
  );

  if (tokenAccounts.length === 0) {
    return [];
  }

  // Step 2: Filter to prediction market outcome mints
  const mints = tokenAccounts.map((t) => t.mint);
  const outcomeMints = await filterOutcomeMints(mints);

  if (outcomeMints.length === 0) {
    return [];
  }

  // Step 3: Fetch market details in batch
  const outcomeMintAddresses = outcomeMints.map((m) => m.mint);
  const marketsByMint = await fetchMarketsBatch(outcomeMintAddresses);

  // Step 4: Build position objects
  const tokenBalanceMap = new Map(
    tokenAccounts.map((t) => [t.mint, t.balance])
  );

  const positions: Position[] = [];

  for (const outcomeMint of outcomeMints) {
    const market = marketsByMint.get(outcomeMint.mint);
    const quantity = tokenBalanceMap.get(outcomeMint.mint) || 0;

    if (quantity <= 0) continue;

    // Determine if YES or NO token
    let side: "yes" | "no" = "yes";
    if (market?.accounts) {
      for (const account of Object.values(market.accounts)) {
        if (account.noMint === outcomeMint.mint) {
          side = "no";
          break;
        }
      }
    }

    // Get current price (default to 0.5 if not available)
    const currentPrice =
      side === "yes" ? market?.yesPrice ?? 0.5 : market?.noPrice ?? 0.5;

    const value = quantity * currentPrice;

    positions.push({
      mint: outcomeMint.mint,
      marketTicker: market?.ticker || outcomeMint.marketTicker,
      marketTitle: market?.title,
      side,
      quantity,
      currentPrice,
      value,
      marketStatus: market?.status,
    });
  }

  return positions;
}

// ============================================================================
// Portfolio Snapshot
// ============================================================================

/**
 * Calculate complete portfolio snapshot for a wallet
 *
 * @param wallet - Wallet address
 * @returns Portfolio snapshot with USDC balance, positions, and total value
 */
export async function getPortfolioSnapshot(
  wallet: string
): Promise<PortfolioSnapshot> {
  // Fetch USDC balance and positions in parallel
  const [usdcResult, positions] = await Promise.all([
    getCurrencyBalance(wallet, "USDC"),
    getPositions(wallet),
  ]);

  const usdcBalance = usdcResult ? parseFloat(usdcResult.formatted) : 0;

  // Sum position values
  const positionsValue = positions.reduce((sum, p) => sum + p.value, 0);

  // Total portfolio value
  const totalValue = usdcBalance + positionsValue;

  return {
    wallet,
    timestamp: new Date(),
    usdcBalance,
    positionsValue,
    totalValue,
    positions,
  };
}

/**
 * Get just the total portfolio value (faster than full snapshot)
 *
 * @param wallet - Wallet address
 * @returns Total portfolio value in USDC
 */
export async function getPortfolioValue(wallet: string): Promise<number> {
  const snapshot = await getPortfolioSnapshot(wallet);
  return snapshot.totalValue;
}
