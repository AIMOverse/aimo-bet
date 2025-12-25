"use client";

import useSWR from "swr";
import { POLLING_INTERVALS } from "@/lib/config";

// ============================================================================
// Types for live event/market data
// ============================================================================

export interface MarketPrice {
  marketTicker: string;
  eventTicker: string;
  eventTitle: string;
  marketTitle: string;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  volume: number | null;
  volume24h: number | null;
}

interface Market {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle: string;
  yesSubTitle: string;
  noSubTitle: string;
  status: string;
  volume: number;
  volume24h?: number;
  openInterest: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
}

interface Event {
  ticker: string;
  seriesTicker: string;
  title: string;
  subtitle: string;
  status: string;
  volume: number;
  volume24h?: number;
  liquidity: number;
  openInterest: number;
  markets?: Market[];
}

interface EventsResponse {
  events: Event[];
  cursor: number | null;
}

interface UseLivePricesReturn {
  prices: MarketPrice[];
  priceMap: Map<string, MarketPrice>;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => Promise<MarketPrice[] | undefined>;
}

// ============================================================================
// Fetch live prices using events endpoint with nested markets
// ============================================================================

async function fetchLivePrices(): Promise<MarketPrice[]> {
  // Fetch events with nested markets to get all data in one call
  const eventsRes = await fetch(
    "/api/dflow/events?status=active&limit=50&withNestedMarkets=true",
  );

  if (!eventsRes.ok) {
    throw new Error("Failed to fetch events");
  }

  const eventsData: EventsResponse = await eventsRes.json();
  const events = eventsData.events || [];

  console.log("[useLivePrices] Fetched", events.length, "events");

  if (events.length === 0) {
    return [];
  }

  // Build price entries from events and their nested markets
  const prices: MarketPrice[] = [];

  for (const event of events) {
    const markets = event.markets || [];

    for (const market of markets) {
      prices.push({
        marketTicker: market.ticker,
        eventTicker: event.ticker,
        eventTitle: event.title,
        marketTitle: market.title || market.yesSubTitle || "Yes",
        yesBid: market.yesBid ?? null,
        yesAsk: market.yesAsk ?? null,
        noBid: market.noBid ?? null,
        noAsk: market.noAsk ?? null,
        volume: market.volume ?? null,
        volume24h: market.volume24h ?? null,
      });
    }
  }

  console.log(
    "[useLivePrices] Built",
    prices.length,
    "market prices from events",
  );

  return prices;
}

/**
 * Hook to fetch live market prices via REST polling.
 * Uses the events endpoint with nested markets for efficient data fetching.
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

  // Create a map for quick lookups by market ticker
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
