"use client";

import { useMemo, useCallback } from "react";
import useSWR from "swr";
import { usePriceSubscription } from "@/hooks/usePriceSubscription";

// ============================================================================
// Constants
// ============================================================================

const MARKETS_CACHE_TIME = 60 * 1000; // 1 minute
const DEFAULT_LIMIT = 30; // Total markets to show in ticker

// ============================================================================
// Types
// ============================================================================

export type Platform = "kalshi" | "polymarket";
export type Category = "politics" | "sports" | "crypto";

export interface TickerMarket {
  /** Unique identifier - market ticker (Kalshi) or YES token ID (Polymarket) */
  ticker: string;
  /** Event identifier for grouping */
  eventTicker: string;
  /** Event title */
  eventTitle: string;
  /** Market/outcome title */
  marketTitle: string;
  /** YES price in cents (0-100) */
  yesPrice: number;
  /** NO price in cents (0-100) */
  noPrice: number;
  /** Trading volume for sorting */
  volume: number;
  /** Source platform */
  platform: Platform;
  /** Market category */
  category: Category;
}

export interface UseTickerMarketsOptions {
  /** Categories to fetch (default: all three) */
  categories?: Category[];
  /** Platforms to fetch from (default: both) */
  platforms?: Platform[];
  /** Maximum total markets to return (default: 30) */
  limit?: number;
}

export interface UseTickerMarketsReturn {
  /** Markets sorted by volume with live prices */
  markets: TickerMarket[];
  /** Price direction map for animations */
  priceDirection: Map<string, "up" | "down" | "neutral">;
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | undefined;
  /** WebSocket connection status */
  isConnected: { kalshi: boolean; polymarket: boolean };
  /** Refetch markets data */
  refetch: () => Promise<void>;
}

// ============================================================================
// API Response Types
// ============================================================================

// Kalshi types
interface KalshiSeries {
  ticker: string;
  title: string;
  category?: string;
}

interface KalshiMarket {
  ticker: string;
  title?: string;
  volume?: number;
  volume24h?: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
}

interface KalshiEvent {
  ticker: string;
  title: string;
  markets?: KalshiMarket[];
}

// Polymarket types (from Gamma API)
interface PolymarketMarket {
  id: string;
  question: string;
  outcomes: string[];
  outcomePrices: string[];
  clobTokenIds?: string; // JSON string array: '["yesTokenId", "noTokenId"]'
  volume: number;
  volume24hr: number;
  bestBid?: number;
  bestAsk?: number;
}

interface PolymarketEvent {
  id: string;
  ticker: string;
  title: string;
  volume: number;
  markets?: PolymarketMarket[];
}

// ============================================================================
// Category Mappings
// ============================================================================

// Kalshi uses these category names
const KALSHI_CATEGORY_MAP: Record<Category, string> = {
  politics: "Politics",
  sports: "Sports",
  crypto: "Crypto",
};

// Polymarket uses tag slugs
const POLYMARKET_TAG_MAP: Record<Category, string> = {
  politics: "politics",
  sports: "sports",
  crypto: "crypto",
};

// ============================================================================
// Fetchers
// ============================================================================

/**
 * Fetch Kalshi markets for a category
 */
async function fetchKalshiMarkets(category: Category): Promise<TickerMarket[]> {
  const kalshiCategory = KALSHI_CATEGORY_MAP[category];

  // 1. Fetch series for category
  const seriesParams = new URLSearchParams({
    category: kalshiCategory,
    status: "active",
  });
  const seriesRes = await fetch(
    `/api/prediction-market/kalshi/dflow/series?${seriesParams}`,
  );
  if (!seriesRes.ok) {
    console.error(
      `[useTickerMarkets] Kalshi series fetch failed for ${category}`,
    );
    return [];
  }
  const seriesData = await seriesRes.json();
  const seriesTickers = (seriesData.series as KalshiSeries[])
    ?.map((s) => s.ticker)
    .slice(0, 25); // API limit

  if (!seriesTickers?.length) return [];

  // 2. Fetch events with nested markets
  const eventsParams = new URLSearchParams({
    seriesTickers: seriesTickers.join(","),
    status: "active",
    limit: "50",
    withNestedMarkets: "true",
  });
  const eventsRes = await fetch(
    `/api/prediction-market/kalshi/dflow/events?${eventsParams}`,
  );
  if (!eventsRes.ok) {
    console.error(
      `[useTickerMarkets] Kalshi events fetch failed for ${category}`,
    );
    return [];
  }
  const eventsData = await eventsRes.json();

  // 3. Transform to TickerMarket
  const markets: TickerMarket[] = [];
  for (const event of (eventsData.events as KalshiEvent[]) || []) {
    for (const market of event.markets || []) {
      const yesBid = market.yesBid ?? 0;
      const yesAsk = market.yesAsk ?? 0;
      const yesPrice = ((yesBid + yesAsk) / 2) * 100; // Convert to cents
      const noPrice = 100 - yesPrice;

      markets.push({
        ticker: market.ticker,
        eventTicker: event.ticker,
        eventTitle: event.title,
        marketTitle: market.title || "Yes",
        yesPrice,
        noPrice,
        volume: market.volume ?? market.volume24h ?? 0,
        platform: "kalshi",
        category,
      });
    }
  }

  return markets;
}

/**
 * Fetch Polymarket markets for a category
 */
async function fetchPolymarketMarkets(
  category: Category,
): Promise<TickerMarket[]> {
  const tagSlug = POLYMARKET_TAG_MAP[category];

  // Fetch events by tag slug with nested markets
  const params = new URLSearchParams({
    tag_slug: tagSlug,
    active: "true",
    closed: "false",
    limit: "50",
    order: "volume24hr",
    ascending: "false",
  });
  const res = await fetch(
    `/api/prediction-market/polymarket/gamma/events?${params}`,
  );
  if (!res.ok) {
    console.error(`[useTickerMarkets] Polymarket fetch failed for ${category}`);
    return [];
  }
  const events = (await res.json()) as PolymarketEvent[];

  // Transform to TickerMarket
  const markets: TickerMarket[] = [];
  for (const event of events || []) {
    for (const market of event.markets || []) {
      // Parse clobTokenIds to get YES token ID for WebSocket subscription
      let yesTokenId: string | null = null;
      if (market.clobTokenIds) {
        try {
          const tokenIds = JSON.parse(market.clobTokenIds) as string[];
          yesTokenId = tokenIds[0] || null;
        } catch {
          // Skip markets without valid token IDs
          continue;
        }
      }
      if (!yesTokenId) continue;

      // Parse outcome prices (comes as string array like ["0.65", "0.35"])
      const yesPriceRaw = parseFloat(market.outcomePrices?.[0] || "0.5");
      const yesPrice = yesPriceRaw * 100; // Convert to cents
      const noPrice = 100 - yesPrice;

      markets.push({
        ticker: yesTokenId, // Use token ID for WebSocket subscription
        eventTicker: event.id,
        eventTitle: event.title,
        marketTitle: market.question,
        yesPrice,
        noPrice,
        volume: market.volume24hr || market.volume || 0,
        platform: "polymarket",
        category,
      });
    }
  }

  return markets;
}

/**
 * Fetch all markets from specified platforms and categories
 */
async function fetchAllMarkets(
  categories: Category[],
  platforms: Platform[],
): Promise<TickerMarket[]> {
  const fetchers: Promise<TickerMarket[]>[] = [];

  for (const category of categories) {
    if (platforms.includes("kalshi")) {
      fetchers.push(fetchKalshiMarkets(category));
    }
    if (platforms.includes("polymarket")) {
      fetchers.push(fetchPolymarketMarkets(category));
    }
  }

  const results = await Promise.all(fetchers);
  const allMarkets = results.flat();

  // Sort by volume descending (trending first)
  allMarkets.sort((a, b) => b.volume - a.volume);

  return allMarkets;
}

// ============================================================================
// Hook
// ============================================================================

export function useTickerMarkets(
  options: UseTickerMarketsOptions = {},
): UseTickerMarketsReturn {
  const {
    categories = ["politics", "sports", "crypto"],
    platforms = ["kalshi", "polymarket"],
    limit = DEFAULT_LIMIT,
  } = options;

  // Create stable cache key
  const cacheKey = useMemo(
    () =>
      `ticker-markets-${categories.sort().join(",")}-${platforms.sort().join(",")}`,
    [categories, platforms],
  );

  // -------------------------------------------------------------------------
  // Fetch markets data (REST)
  // -------------------------------------------------------------------------
  const {
    data: allMarkets,
    error,
    isLoading,
    mutate,
  } = useSWR(cacheKey, () => fetchAllMarkets(categories, platforms), {
    revalidateOnFocus: false,
    dedupingInterval: MARKETS_CACHE_TIME,
  });

  // Limit to top N markets
  const topMarkets = useMemo(() => {
    return (allMarkets || []).slice(0, limit);
  }, [allMarkets, limit]);

  // Extract tickers for WebSocket subscription
  const tickers = useMemo(() => {
    return topMarkets.map((m) => m.ticker);
  }, [topMarkets]);

  // -------------------------------------------------------------------------
  // Subscribe to live prices
  // -------------------------------------------------------------------------
  const {
    prices: livePrices,
    priceDirection,
    isConnected,
    error: wsError,
  } = usePriceSubscription(tickers);

  // -------------------------------------------------------------------------
  // Merge live prices into markets
  // -------------------------------------------------------------------------
  const markets = useMemo(() => {
    if (livePrices.size === 0) return topMarkets;

    return topMarkets.map((market) => {
      const livePrice = livePrices.get(market.ticker);
      if (!livePrice) return market;

      return {
        ...market,
        yesPrice: livePrice.yesPrice * 100, // Convert 0-1 to cents
        noPrice: livePrice.noPrice * 100,
      };
    });
  }, [topMarkets, livePrices]);

  // -------------------------------------------------------------------------
  // Refetch helper
  // -------------------------------------------------------------------------
  const refetch = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    markets,
    priceDirection,
    isLoading,
    error: error || wsError,
    isConnected,
    refetch,
  };
}
