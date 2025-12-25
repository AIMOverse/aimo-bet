"use client";

import useSWR from "swr";
import { POLLING_INTERVALS } from "@/lib/config";

// ============================================================================
// Types for live market data
// ============================================================================

export interface MarketPrice {
  marketTicker: string;
  milestoneId: string;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
}

interface Market {
  ticker: string;
  milestoneId?: string;
}

interface LiveDataEntry {
  milestoneId: string;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
}

interface UseLivePricesReturn {
  prices: MarketPrice[];
  priceMap: Map<string, MarketPrice>;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => Promise<MarketPrice[] | undefined>;
}

// ============================================================================
// Fetch live prices using markets + live-data flow
// 1. Fetch markets to get milestoneIds
// 2. Fetch live-data with milestoneIds
// ============================================================================

async function fetchLivePrices(): Promise<MarketPrice[]> {
  // Step 1: Fetch markets to get milestoneIds
  const marketsRes = await fetch("/api/dflow/markets?status=active&limit=100");
  if (!marketsRes.ok) {
    throw new Error("Failed to fetch markets");
  }

  const marketsData = await marketsRes.json();
  const markets: Market[] = Array.isArray(marketsData)
    ? marketsData
    : marketsData.markets || [];

  if (markets.length === 0) {
    return [];
  }

  // Extract milestoneIds from markets
  const milestoneToTicker = new Map<string, string>();
  const milestoneIds: string[] = [];

  for (const market of markets) {
    if (market.milestoneId) {
      milestoneIds.push(market.milestoneId);
      milestoneToTicker.set(market.milestoneId, market.ticker);
    }
  }

  if (milestoneIds.length === 0) {
    return [];
  }

  // Step 2: Fetch live data with milestoneIds
  const liveDataRes = await fetch(
    `/api/dflow/live-data?milestoneIds=${milestoneIds.join(",")}`,
  );

  if (!liveDataRes.ok) {
    throw new Error("Failed to fetch live data");
  }

  const liveData = await liveDataRes.json();
  const liveDataArray: LiveDataEntry[] = Array.isArray(liveData)
    ? liveData
    : liveData.data || [];

  // Build price entries
  const prices: MarketPrice[] = [];

  for (const entry of liveDataArray) {
    const ticker = milestoneToTicker.get(entry.milestoneId);
    if (!ticker) continue;

    prices.push({
      marketTicker: ticker,
      milestoneId: entry.milestoneId,
      yesBid: entry.yesBid ?? null,
      yesAsk: entry.yesAsk ?? null,
      noBid: entry.noBid ?? null,
      noAsk: entry.noAsk ?? null,
    });
  }

  return prices;
}

/**
 * Hook to fetch live market prices via REST polling.
 * Uses the new markets + live-data flow:
 * 1. Fetch markets to get milestoneIds
 * 2. Fetch live-data with milestoneIds
 *
 * @param refreshInterval - Polling interval in ms (default from config)
 */
export function useLivePrices(
  refreshInterval = POLLING_INTERVALS.prices,
): UseLivePricesReturn {
  const { data, error, isLoading, mutate } = useSWR<MarketPrice[]>(
    "dflow/live-prices",
    fetchLivePrices,
    { refreshInterval },
  );

  // Create a map for quick lookups by ticker
  const priceMap = new Map<string, MarketPrice>();
  if (data && Array.isArray(data)) {
    data.forEach((price) => {
      priceMap.set(price.marketTicker, price);
    });
  }

  // Ensure prices is always an array
  const prices = Array.isArray(data) ? data : [];

  return {
    prices,
    priceMap,
    isLoading,
    error,
    mutate,
  };
}
