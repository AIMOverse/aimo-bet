"use client";

import useSWR from "swr";
import { POLLING_INTERVALS } from "@/lib/config";

export interface MarketPrice {
  market_ticker: string;
  yes_bid: string | null;
  yes_ask: string | null;
  no_bid: string | null;
  no_ask: string | null;
}

interface UseLivePricesReturn {
  prices: MarketPrice[];
  priceMap: Map<string, MarketPrice>;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => Promise<MarketPrice[] | undefined>;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Hook to fetch live market prices via REST polling.
 * Uses SWR for automatic revalidation and caching.
 *
 * @param refreshInterval - Polling interval in ms (default: 5000)
 */
export function useLivePrices(
  refreshInterval = POLLING_INTERVALS.prices,
): UseLivePricesReturn {
  const { data, error, isLoading, mutate } = useSWR<MarketPrice[]>(
    "/api/dflow/prices",
    fetcher,
    { refreshInterval },
  );

  // Create a map for quick lookups by ticker
  const priceMap = new Map<string, MarketPrice>();
  if (data && Array.isArray(data)) {
    data.forEach((price) => {
      priceMap.set(price.market_ticker, price);
    });
  }

  // Ensure prices is always an array (API might return object with error or nested data)
  const prices = Array.isArray(data) ? data : [];

  return {
    prices,
    priceMap,
    isLoading,
    error,
    mutate,
  };
}
