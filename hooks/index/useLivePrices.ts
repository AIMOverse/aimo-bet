"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import useSWR from "swr";
import PartySocket from "partysocket";

// ============================================================================
// Constants
// ============================================================================

const SERIES_CACHE_TIME = 24 * 60 * 60 * 1000; // 24 hours
const EVENTS_CACHE_TIME = 60 * 1000; // 1 minute
const DIRECTION_FLASH_DURATION = 1000; // 1 second

// ============================================================================
// Types
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

export type PriceDirection = "up" | "down" | "neutral";

export interface UseLivePricesReturn {
  prices: MarketPrice[];
  priceMap: Map<string, MarketPrice>;
  priceDirection: Map<string, PriceDirection>;
  isLoading: boolean;
  error: Error | undefined;
  isConnected: boolean;
  refetch: () => Promise<void>;
}

// ============================================================================
// API Response Types
// ============================================================================

interface Series {
  ticker: string;
  title: string;
  category?: string;
}

interface SeriesResponse {
  series: Series[];
}

interface Market {
  ticker: string;
  title?: string;
  volume?: number;
  volume24h?: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
}

interface Event {
  ticker: string;
  title: string;
  markets?: Market[];
}

interface EventsResponse {
  events: Event[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Fetch series from API route
 */
async function fetchSeriesFromApi(
  category: string,
  status: string,
): Promise<SeriesResponse> {
  const params = new URLSearchParams({ category, status });
  const response = await fetch(`/api/dflow/series?${params}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch series: ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch events from API route
 */
async function fetchEventsFromApi(
  seriesTickers: string[],
  status: string,
  limit: number,
): Promise<EventsResponse> {
  const params = new URLSearchParams({
    seriesTickers: seriesTickers.join(","),
    status,
    limit: String(limit),
    withNestedMarkets: "true",
  });
  const response = await fetch(`/api/dflow/events?${params}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch events: ${response.status}`);
  }
  return response.json();
}

/**
 * Transform events response into flat MarketPrice array
 */
function eventsToMarketPrices(events: Event[]): MarketPrice[] {
  const prices: MarketPrice[] = [];

  for (const event of events) {
    for (const market of event.markets || []) {
      prices.push({
        marketTicker: market.ticker,
        eventTicker: event.ticker,
        eventTitle: event.title,
        marketTitle: market.title || "Yes",
        yesBid: market.yesBid ?? null,
        yesAsk: market.yesAsk ?? null,
        noBid: market.noBid ?? null,
        noAsk: market.noAsk ?? null,
        volume: market.volume ?? null,
        volume24h: market.volume24h ?? null,
      });
    }
  }

  return prices;
}

// ============================================================================
// Hook
// ============================================================================

export function useLivePrices(): UseLivePricesReturn {
  // -------------------------------------------------------------------------
  // State for WebSocket updates only (not initial data)
  // -------------------------------------------------------------------------
  const [wsUpdates, setWsUpdates] = useState<Map<string, Partial<MarketPrice>>>(
    new Map(),
  );
  const [priceDirection, setPriceDirection] = useState<
    Map<string, PriceDirection>
  >(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const directionTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const socketRef = useRef<PartySocket | null>(null);

  // -------------------------------------------------------------------------
  // 1. Fetch Crypto series tickers (cached 24h)
  // Uses existing fetchSeriesByCategory from discover.ts
  // -------------------------------------------------------------------------
  const {
    data: seriesResponse,
    error: seriesError,
    isLoading: seriesLoading,
  } = useSWR(
    "crypto-series",
    async () => {
      console.log("[useLivePrices] Fetching Crypto series...");
      try {
        const response = await fetchSeriesFromApi("Crypto", "active");
        console.log("[useLivePrices] Series response:", response);
        return response;
      } catch (err) {
        console.error("[useLivePrices] Series fetch error:", err);
        throw err;
      }
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: SERIES_CACHE_TIME,
    },
  );

  // Extract series tickers from response (limit to 25 due to API constraint)
  const seriesTickers = useMemo(() => {
    const tickers = seriesResponse?.series?.map((s) => s.ticker) || [];
    return tickers.slice(0, 25);
  }, [seriesResponse]);

  // -------------------------------------------------------------------------
  // 2. Fetch Crypto events (cached 1min, depends on series tickers)
  // Uses existing fetchEventsBySeries from discover.ts
  // -------------------------------------------------------------------------
  const {
    data: eventsResponse,
    error: eventsError,
    isLoading: eventsLoading,
    mutate,
  } = useSWR(
    seriesTickers.length > 0 ? ["crypto-events", seriesTickers] : null,
    async () => {
      console.log("[useLivePrices] Fetching events for series:", seriesTickers);
      try {
        const response = await fetchEventsFromApi(seriesTickers, "active", 100);
        console.log("[useLivePrices] Events response:", response);
        return response;
      } catch (err) {
        console.error("[useLivePrices] Events fetch error:", err);
        throw err;
      }
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: EVENTS_CACHE_TIME,
    },
  );

  // Transform events to MarketPrice array (base data from REST)
  const initialPrices = useMemo(() => {
    return eventsToMarketPrices(eventsResponse?.events || []);
  }, [eventsResponse]);

  // Build initial prices map from REST data
  const initialPricesMap = useMemo(() => {
    const map = new Map<string, MarketPrice>();
    initialPrices.forEach((p) => map.set(p.marketTicker, p));
    return map;
  }, [initialPrices]);

  // -------------------------------------------------------------------------
  // Merge initial prices with WebSocket updates
  // -------------------------------------------------------------------------
  const pricesMap = useMemo(() => {
    if (wsUpdates.size === 0) return initialPricesMap;

    const merged = new Map(initialPricesMap);
    wsUpdates.forEach((update, ticker) => {
      const existing = merged.get(ticker);
      if (existing) {
        merged.set(ticker, { ...existing, ...update });
      }
    });
    return merged;
  }, [initialPricesMap, wsUpdates]);

  // -------------------------------------------------------------------------
  // Build ticker set for filtering WS messages
  // -------------------------------------------------------------------------
  const tickerSet = useMemo(() => {
    return new Set(initialPrices.map((p) => p.marketTicker));
  }, [initialPrices]);

  // -------------------------------------------------------------------------
  // WebSocket message handler (memoized to avoid recreating on every render)
  // -------------------------------------------------------------------------
  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);

        // Only process price messages for our tickers
        if (msg.channel !== "prices") return;
        if (!tickerSet.has(msg.market_ticker)) return;

        const ticker = msg.market_ticker;
        const newYesBid = msg.yes_bid ? parseFloat(msg.yes_bid) : null;
        const newYesAsk = msg.yes_ask ? parseFloat(msg.yes_ask) : null;
        const newNoBid = msg.no_bid ? parseFloat(msg.no_bid) : null;
        const newNoAsk = msg.no_ask ? parseFloat(msg.no_ask) : null;

        // Get current price for direction calculation
        const existing = initialPricesMap.get(ticker);
        if (!existing) return;

        // Calculate direction based on mid price
        const oldMid = ((existing.yesBid ?? 0) + (existing.yesAsk ?? 0)) / 2;
        const newMid = ((newYesBid ?? 0) + (newYesAsk ?? 0)) / 2;

        let direction: PriceDirection = "neutral";
        if (newMid > oldMid) direction = "up";
        else if (newMid < oldMid) direction = "down";

        // Update direction with timeout for flash effect
        if (direction !== "neutral") {
          setPriceDirection((dirPrev) =>
            new Map(dirPrev).set(ticker, direction),
          );

          // Clear existing timeout
          const existingTimeout = directionTimeouts.current.get(ticker);
          if (existingTimeout) clearTimeout(existingTimeout);

          // Set new timeout to clear direction after flash duration
          directionTimeouts.current.set(
            ticker,
            setTimeout(() => {
              setPriceDirection((dirPrev) => {
                const next = new Map(dirPrev);
                next.delete(ticker);
                return next;
              });
              directionTimeouts.current.delete(ticker);
            }, DIRECTION_FLASH_DURATION),
          );
        }

        // Store WebSocket update
        setWsUpdates((prev) => {
          const updated = new Map(prev);
          updated.set(ticker, {
            yesBid: newYesBid,
            yesAsk: newYesAsk,
            noBid: newNoBid,
            noAsk: newNoAsk,
          });
          return updated;
        });
      } catch (error) {
        console.error("[useLivePrices] Failed to parse WS message:", error);
      }
    },
    [tickerSet, initialPricesMap],
  );

  // -------------------------------------------------------------------------
  // 3. WebSocket connection to PartyKit dflow-relay
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Don't connect until we have tickers to filter
    if (tickerSet.size === 0) return;

    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    if (!host) {
      console.warn("[useLivePrices] NEXT_PUBLIC_PARTYKIT_HOST not set");
      return;
    }

    const socket = new PartySocket({
      host,
      room: "dflow-relay",
    });

    socketRef.current = socket;

    socket.onopen = () => {
      console.log("[useLivePrices] WebSocket connected");
      setIsConnected(true);
    };

    socket.onclose = () => {
      console.log("[useLivePrices] WebSocket disconnected");
      setIsConnected(false);
    };

    socket.onerror = (error) => {
      console.error("[useLivePrices] WebSocket error:", error);
    };

    socket.onmessage = handleWsMessage;

    return () => {
      socket.close();
      socketRef.current = null;
      // Clear all direction timeouts on cleanup
      directionTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      directionTimeouts.current.clear();
    };
  }, [tickerSet, handleWsMessage]);

  // -------------------------------------------------------------------------
  // Build return values
  // -------------------------------------------------------------------------
  const prices = useMemo(() => Array.from(pricesMap.values()), [pricesMap]);

  const isLoading = seriesLoading || eventsLoading;
  const error = seriesError || eventsError;

  // Debug logging
  console.log("[useLivePrices] State:", {
    seriesLoading,
    eventsLoading,
    isLoading,
    seriesError: seriesError?.message,
    eventsError: eventsError?.message,
    seriesCount: seriesResponse?.series?.length ?? 0,
    seriesTickers,
    eventsCount: eventsResponse?.events?.length ?? 0,
    pricesCount: prices.length,
  });

  // Wrap mutate to refetch events
  const refetch = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    prices,
    priceMap: pricesMap,
    priceDirection,
    isLoading,
    error,
    isConnected,
    refetch,
  };
}
