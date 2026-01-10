// ============================================================================
// Market Resolution Helper
// Resolves market tickers to mint addresses for trading
// ============================================================================

import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";
import { TOKEN_MINTS } from "@/lib/crypto/solana/client";
import type { MarketStatus } from "@/lib/prediction-market/kalshi/dflow/prediction-markets/types";

// ============================================================================
// Types
// ============================================================================

export interface ResolvedMints {
  /** Market ticker (e.g., "BTC-100K-2024") */
  market_ticker: string;
  /** Event ticker */
  event_ticker: string;
  /** Market title */
  title: string;
  /** Settlement mint (USDC) */
  settlement_mint: string;
  /** YES outcome token mint */
  yes_mint: string;
  /** NO outcome token mint */
  no_mint: string;
  /** Market ledger address */
  market_ledger: string;
  /** Current market status */
  status: MarketStatus;
  /** Market result if resolved */
  result?: string;
}

interface MarketByTickerResponse {
  ticker: string;
  title: string;
  eventTicker: string;
  status: MarketStatus;
  result?: string;
  accounts: Record<
    string,
    {
      yesMint: string;
      noMint: string;
      marketLedger: string;
    }
  >;
}

// ============================================================================
// Cache
// ============================================================================

const marketCache = new Map<string, { data: ResolvedMints; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(ticker: string): ResolvedMints | null {
  const cached = marketCache.get(ticker);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  marketCache.delete(ticker);
  return null;
}

function setCache(ticker: string, data: ResolvedMints): void {
  marketCache.set(ticker, {
    data,
    expires: Date.now() + CACHE_TTL_MS,
  });
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Resolve a market ticker to mint addresses
 * Caches results to avoid repeated API calls
 *
 * @param marketTicker - Market ticker (e.g., "BTC-100K-2024")
 * @returns Resolved mint addresses and market info
 * @throws Error if market not found
 */
export async function resolveMints(
  marketTicker: string,
): Promise<ResolvedMints> {
  // Check cache first
  const cached = getCached(marketTicker);
  if (cached) {
    console.log("[resolveMints] Cache hit for:", marketTicker);
    return cached;
  }

  console.log("[resolveMints] Fetching market:", marketTicker);

  const response = await dflowMetadataFetch(
    `/market/${encodeURIComponent(marketTicker)}`,
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Market '${marketTicker}' not found`);
    }
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch market: ${response.status} - ${errorText}`,
    );
  }

  const market: MarketByTickerResponse = await response.json();

  // Get the USDC settlement account (primary)
  const usdcAccount = market.accounts[TOKEN_MINTS.USDC];
  if (!usdcAccount) {
    // Try to find any account with mints
    const firstAccountKey = Object.keys(market.accounts)[0];
    if (!firstAccountKey) {
      throw new Error(`Market '${marketTicker}' has no accounts configured`);
    }
    const firstAccount = market.accounts[firstAccountKey];

    const resolved: ResolvedMints = {
      market_ticker: market.ticker,
      event_ticker: market.eventTicker,
      title: market.title,
      settlement_mint: firstAccountKey,
      yes_mint: firstAccount.yesMint,
      no_mint: firstAccount.noMint,
      market_ledger: firstAccount.marketLedger,
      status: market.status,
      result: market.result,
    };

    setCache(marketTicker, resolved);
    return resolved;
  }

  const resolved: ResolvedMints = {
    market_ticker: market.ticker,
    event_ticker: market.eventTicker,
    title: market.title,
    settlement_mint: TOKEN_MINTS.USDC,
    yes_mint: usdcAccount.yesMint,
    no_mint: usdcAccount.noMint,
    market_ledger: usdcAccount.marketLedger,
    status: market.status,
    result: market.result,
  };

  setCache(marketTicker, resolved);
  console.log("[resolveMints] Resolved:", {
    ticker: resolved.market_ticker,
    yes_mint: resolved.yes_mint.slice(0, 8) + "...",
    no_mint: resolved.no_mint.slice(0, 8) + "...",
  });

  return resolved;
}

/**
 * Get input/output mints for a BUY trade
 * Buying: USDC → Outcome Token
 */
export function getTradeMintsForBuy(
  resolved: ResolvedMints,
  side: "yes" | "no",
): { inputMint: string; outputMint: string } {
  return {
    inputMint: resolved.settlement_mint,
    outputMint: side === "yes" ? resolved.yes_mint : resolved.no_mint,
  };
}

/**
 * Get input/output mints for a SELL trade
 * Selling: Outcome Token → USDC
 */
export function getTradeMintsForSell(
  resolved: ResolvedMints,
  side: "yes" | "no",
): { inputMint: string; outputMint: string } {
  return {
    inputMint: side === "yes" ? resolved.yes_mint : resolved.no_mint,
    outputMint: resolved.settlement_mint,
  };
}

/**
 * Get the outcome mint for a side
 */
export function getOutcomeMint(
  resolved: ResolvedMints,
  side: "yes" | "no",
): string {
  return side === "yes" ? resolved.yes_mint : resolved.no_mint;
}

/**
 * Clear the market cache (useful for testing)
 */
export function clearMarketCache(): void {
  marketCache.clear();
}
