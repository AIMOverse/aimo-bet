/**
 * Price storage and swing detection for autonomous trading.
 * Tracks market prices and detects significant price movements.
 */

import { createServerClient } from "./server";
import { TRADING_CONFIG } from "@/lib/config";

// ============================================================================
// Types
// ============================================================================

export interface MarketPrice {
  ticker: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
}

export interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

interface StoredPrice {
  ticker: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  updated_at: string;
}

// ============================================================================
// Price Storage
// ============================================================================

/**
 * Get the current stored prices for all markets
 */
export async function getStoredPrices(): Promise<Map<string, StoredPrice>> {
  const supabase = createServerClient();
  if (!supabase) {
    console.warn("[prices] Supabase not configured, skipping price fetch");
    return new Map();
  }

  const { data, error } = await supabase
    .from("market_prices")
    .select("ticker, yes_bid, yes_ask, no_bid, no_ask, updated_at");

  if (error) {
    console.error("[prices] Failed to fetch stored prices:", error);
    return new Map();
  }

  return new Map((data || []).map((p) => [p.ticker, p as StoredPrice]));
}

/**
 * Update stored prices in database
 */
export async function updateStoredPrices(
  prices: MarketPrice[]
): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) {
    console.warn("[prices] Supabase not configured, skipping price update");
    return;
  }

  const now = new Date().toISOString();
  const records = prices.map((p) => ({
    ticker: p.ticker,
    yes_bid: p.yes_bid,
    yes_ask: p.yes_ask,
    no_bid: p.no_bid,
    no_ask: p.no_ask,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("market_prices")
    .upsert(records, { onConflict: "ticker" });

  if (error) {
    console.error("[prices] Failed to update prices:", error);
  }
}

/**
 * Save price history for trend analysis
 */
export async function savePriceHistory(prices: MarketPrice[]): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) {
    return;
  }

  const now = new Date().toISOString();
  const records = prices.map((p) => ({
    ticker: p.ticker,
    yes_mid: (p.yes_bid + p.yes_ask) / 2,
    recorded_at: now,
  }));

  const { error } = await supabase.from("market_price_history").insert(records);

  if (error) {
    console.error("[prices] Failed to save price history:", error);
  }
}

// ============================================================================
// Swing Detection
// ============================================================================

/**
 * Calculate the mid price for a market
 */
function getMidPrice(price: { yes_bid: number; yes_ask: number }): number {
  return (price.yes_bid + price.yes_ask) / 2;
}

/**
 * Detect price swings by comparing current prices to stored prices.
 * Returns markets with price changes exceeding the threshold.
 */
export function detectPriceSwings(
  currentPrices: MarketPrice[],
  storedPrices: Map<string, StoredPrice>,
  threshold: number = TRADING_CONFIG.swingThreshold
): PriceSwing[] {
  const swings: PriceSwing[] = [];

  for (const current of currentPrices) {
    const stored = storedPrices.get(current.ticker);
    if (!stored) {
      // New market, no previous price to compare
      continue;
    }

    const currentMid = getMidPrice(current);
    const previousMid = getMidPrice(stored);

    // Skip if previous price is 0 to avoid division by zero
    if (previousMid === 0) continue;

    const changePercent = Math.abs(currentMid - previousMid) / previousMid;

    if (changePercent >= threshold) {
      swings.push({
        ticker: current.ticker,
        previousPrice: previousMid,
        currentPrice: currentMid,
        changePercent,
      });
    }
  }

  // Sort by change percent descending
  return swings.sort((a, b) => b.changePercent - a.changePercent);
}

/**
 * Sync prices and detect swings in one operation.
 * - Fetches stored prices from database
 * - Detects swings by comparing to current prices
 * - Updates stored prices
 * - Saves price history
 */
export async function syncPricesAndDetectSwings(
  currentPrices: MarketPrice[],
  threshold: number = TRADING_CONFIG.swingThreshold
): Promise<PriceSwing[]> {
  // Get previous prices
  const storedPrices = await getStoredPrices();

  // Detect swings
  const swings = detectPriceSwings(currentPrices, storedPrices, threshold);

  // Update stored prices
  await updateStoredPrices(currentPrices);

  // Save to history (for trend analysis)
  await savePriceHistory(currentPrices);

  console.log(
    `[prices] Synced ${currentPrices.length} prices, detected ${swings.length} swings`
  );

  return swings;
}

/**
 * Clean up old price history (keep last 24 hours)
 */
export async function cleanupPriceHistory(): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) {
    return;
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("market_price_history")
    .delete()
    .lt("recorded_at", cutoff);

  if (error) {
    console.error("[prices] Failed to cleanup price history:", error);
  }
}
