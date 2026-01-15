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
  yesBid?: string; // API returns strings like "0.2300"
  yesAsk?: string;
  noBid?: string;
  noAsk?: string;
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
      // Parse prices - API returns strings like "0.2300"
      const yesBid = market.yesBid ? parseFloat(market.yesBid) : undefined;
      const yesAsk = market.yesAsk ? parseFloat(market.yesAsk) : undefined;

      // Calculate yes price (prices are in 0-1 range, convert to cents 0-100)
      let yesPrice: number;
      if (
        yesBid !== undefined &&
        yesAsk !== undefined &&
        Number.isFinite(yesBid) &&
        Number.isFinite(yesAsk)
      ) {
        yesPrice = ((yesBid + yesAsk) / 2) * 100;
      } else if (yesAsk !== undefined && Number.isFinite(yesAsk)) {
        yesPrice = yesAsk * 100;
      } else if (yesBid !== undefined && Number.isFinite(yesBid)) {
        yesPrice = yesBid * 100;
      } else {
        yesPrice = 50; // Default to 50% if no price data
      }
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
      // The API may return this as a JSON string or an actual array
      let outcomePrices = market.outcomePrices;
      if (typeof outcomePrices === "string") {
        try {
          outcomePrices = JSON.parse(outcomePrices);
        } catch {
          outcomePrices = [];
        }
      }

      const yesPriceRaw = parseFloat(outcomePrices?.[0] || "0.5");
      // Handle NaN - default to 50 cents (50%)
      const yesPrice = Number.isFinite(yesPriceRaw) ? yesPriceRaw * 100 : 50;
      const noPrice = 100 - yesPrice;

      // Skip markets with extreme prices (less than 5% or more than 95%)
      // These are usually long-shot bets that aren't interesting for display
      if (yesPrice < 5 || yesPrice > 95) {
        continue;
      }

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
 * Returns markets interleaved by platform (polymarket, kalshi, polymarket, ...)
 */
async function fetchAllMarkets(
  categories: Category[],
  platforms: Platform[],
): Promise<TickerMarket[]> {
  const kalshiFetchers: Promise<TickerMarket[]>[] = [];
  const polymarketFetchers: Promise<TickerMarket[]>[] = [];

  for (const category of categories) {
    if (platforms.includes("kalshi")) {
      kalshiFetchers.push(fetchKalshiMarkets(category));
    }
    if (platforms.includes("polymarket")) {
      polymarketFetchers.push(fetchPolymarketMarkets(category));
    }
  }

  const [kalshiResults, polymarketResults] = await Promise.all([
    Promise.all(kalshiFetchers),
    Promise.all(polymarketFetchers),
  ]);

  // Flatten and sort each platform's markets by volume
  const kalshiMarkets = kalshiResults
    .flat()
    .sort((a, b) => b.volume - a.volume);
  const polymarketMarkets = polymarketResults
    .flat()
    .sort((a, b) => b.volume - a.volume);

  // Interleave markets: polymarket, kalshi, polymarket, kalshi, ...
  const interleaved: TickerMarket[] = [];
  const maxLen = Math.max(kalshiMarkets.length, polymarketMarkets.length);
  for (let i = 0; i < maxLen; i++) {
    if (polymarketMarkets[i]) {
      interleaved.push(polymarketMarkets[i]);
    }
    if (kalshiMarkets[i]) {
      interleaved.push(kalshiMarkets[i]);
    }
  }

  return interleaved;
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

      const yesPrice = livePrice.yesPrice * 100; // Convert 0-1 to cents
      const noPrice = livePrice.noPrice * 100;

      return {
        ...market,
        yesPrice,
        noPrice,
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
