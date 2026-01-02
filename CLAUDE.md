# Real-Time Crypto MarketTicker Implementation

Implement real-time price updates for the MarketTicker component, filtered to Crypto category only, using WebSocket subscription via PartyKit.

---

## Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  useLivePrices hook (Crypto-only)                                           │
│                                                                             │
│  ┌───────────────────────────┐                                              │
│  │ 1. Fetch Crypto Series    │  fetchSeriesByCategory("Crypto", {status})   │
│  │    (SWR, 24h dedupe)      │  from lib/dflow/prediction-markets/discover  │
│  └───────────┬───────────────┘                                              │
│              │ seriesTickers: ["KXBTCPRICE", "KXETHPRICE", ...]             │
│              ▼                                                              │
│  ┌───────────────────────────┐                                              │
│  │ 2. Fetch Crypto Events    │  fetchEventsBySeries(tickers, {status})      │
│  │    (SWR, 1min dedupe)     │  from lib/dflow/prediction-markets/discover  │
│  └───────────┬───────────────┘                                              │
│              │ events with nested markets                                   │
│              ▼                                                              │
│  ┌───────────────────────────┐    ┌────────────────────────────┐           │
│  │ 3. PartySocket            │───▶│ prices state (Map)         │           │
│  │    dflow-relay room       │    │ priceDirection (Map)       │           │
│  │    Filter to our tickers  │    │ isConnected (boolean)      │           │
│  └───────────────────────────┘    └────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MarketTicker component                                                     │
│  - Ticker (continuous auto-scroll marquee)                                  │
│  - AnimateNumber (smooth price transitions on WS update)                    │
│  - Green/red flash on price direction change                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Fetch Crypto series**: `fetchSeriesByCategory("Crypto", { status: "active" })` (cached 24h)
2. **Fetch Crypto events**: `fetchEventsBySeries(tickers, { status: "active" })` (cached 1min)
3. **WebSocket connect**: Connect to PartyKit `dflow-relay` room
4. **Filter messages**: Only process `PriceMessage` for tickers in fetched events
5. **Update state**: Merge new prices into existing market data
6. **Track direction**: Store price direction (`up` | `down` | `neutral`) with 1s timeout
7. **Animate UI**: AnimateNumber reacts to price changes, Ticker scrolls continuously

---

## Files to Modify

### 1. `hooks/index/useLivePrices.ts`

**Changes:**

- Import `fetchSeriesByCategory` and `fetchEventsBySeries` from `lib/dflow/prediction-markets/discover`
- Use existing typed functions instead of raw fetch calls
- Add SWR fetch for Crypto series tickers (24h cache)
- Add SWR fetch for events filtered by series (1min cache)
- Add PartySocket connection to `dflow-relay` room
- Add `priceDirection` map with 1s timeout
- Filter incoming WS messages to only update fetched tickers

**Types:**

```typescript
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

export type PriceDirection = 'up' | 'down' | 'neutral';

export interface UseLivePricesReturn {
  prices: MarketPrice[];
  priceMap: Map<string, MarketPrice>;
  priceDirection: Map<string, PriceDirection>;
  isLoading: boolean;
  error: Error | undefined;
  isConnected: boolean;
  mutate: () => Promise<MarketPrice[] | undefined>;
}
```

**Implementation:**

```typescript
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import PartySocket from "partysocket";
import {
  fetchSeriesByCategory,
  fetchEventsBySeries,
  type Event,
} from "@/lib/dflow/prediction-markets/discover";

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
  mutate: () => Promise<MarketPrice[] | undefined>;
}

// ============================================================================
// Helpers
// ============================================================================

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

  return prices;
}

// ============================================================================
// Hook
// ============================================================================

export function useLivePrices(): UseLivePricesReturn {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [pricesMap, setPricesMap] = useState<Map<string, MarketPrice>>(new Map());
  const [priceDirection, setPriceDirection] = useState<Map<string, PriceDirection>>(new Map());
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
    () => fetchSeriesByCategory("Crypto", { status: "active" }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: SERIES_CACHE_TIME,
    }
  );

  // Extract series tickers from response
  const seriesTickers = useMemo(() => {
    return seriesResponse?.series?.map((s) => s.ticker) || [];
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
    () => fetchEventsBySeries(seriesTickers, { status: "active", limit: 100 }),
    {
      revalidateOnFocus: false,
      dedupingInterval: EVENTS_CACHE_TIME,
    }
  );

  // Transform events to MarketPrice array
  const initialPrices = useMemo(() => {
    return eventsToMarketPrices(eventsResponse?.events || []);
  }, [eventsResponse]);

  // -------------------------------------------------------------------------
  // Build ticker set for filtering WS messages
  // -------------------------------------------------------------------------
  const tickerSet = useMemo(() => {
    return new Set(initialPrices.map((p) => p.marketTicker));
  }, [initialPrices]);

  // -------------------------------------------------------------------------
  // Initialize prices map from REST data
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (initialPrices.length > 0) {
      const map = new Map<string, MarketPrice>();
      initialPrices.forEach((p) => map.set(p.marketTicker, p));
      setPricesMap(map);
    }
  }, [initialPrices]);

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

    socket.onmessage = (event) => {
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

        setPricesMap((prev) => {
          const existing = prev.get(ticker);
          if (!existing) return prev;

          // Calculate direction based on mid price
          const oldMid = ((existing.yesBid ?? 0) + (existing.yesAsk ?? 0)) / 2;
          const newMid = ((newYesBid ?? 0) + (newYesAsk ?? 0)) / 2;

          let direction: PriceDirection = "neutral";
          if (newMid > oldMid) direction = "up";
          else if (newMid < oldMid) direction = "down";

          // Update direction with timeout for flash effect
          if (direction !== "neutral") {
            setPriceDirection((dirPrev) => new Map(dirPrev).set(ticker, direction));

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
              }, DIRECTION_FLASH_DURATION)
            );
          }

          // Update price in map
          const updated = new Map(prev);
          updated.set(ticker, {
            ...existing,
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
    };

    return () => {
      socket.close();
      socketRef.current = null;
      // Clear all direction timeouts on cleanup
      directionTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      directionTimeouts.current.clear();
    };
  }, [tickerSet]);

  // -------------------------------------------------------------------------
  // Build return values
  // -------------------------------------------------------------------------
  const prices = useMemo(() => Array.from(pricesMap.values()), [pricesMap]);

  const isLoading = seriesLoading || eventsLoading;
  const error = seriesError || eventsError;

  return {
    prices,
    priceMap: pricesMap,
    priceDirection,
    isLoading,
    error,
    isConnected,
    mutate,
  };
}
```

---

### 2. `components/index/MarketTicker.tsx`

**Changes:**

- Import `Ticker` and `AnimateNumber` from `motion-plus/react`
- Wrap market list in `Ticker` for continuous auto-scroll
- Use `AnimateNumber` for yesBid/yesAsk values
- Add green/red flash class based on `priceDirection`

**Implementation:**

```typescript
"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useLivePrices, type MarketPrice } from "@/hooks/index/useLivePrices";
import { Ticker, AnimateNumber } from "motion-plus/react";
import { cn } from "@/lib/utils";

export function MarketTicker() {
  const { prices, priceDirection, isLoading, error, isConnected } = useLivePrices();

  if (isLoading) {
    return (
      <div className="flex items-center gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load markets
      </div>
    );
  }

  if (prices.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No crypto markets available</div>
    );
  }

  // Format price: convert 0-1 to cents (0-100)
  const formatPriceCents = (price: number | null): number => {
    if (price === null) return 0;
    return price > 1 ? price : Math.round(price * 100);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Optional: Connection indicator */}
      {!isConnected && (
        <div className="absolute right-0 top-0 h-2 w-2 rounded-full bg-yellow-500" title="Connecting..." />
      )}
      
      <Ticker speed={30} className="flex items-center gap-8 text-sm">
        {prices.map((market: MarketPrice) => {
          const direction = priceDirection.get(market.marketTicker);

          return (
            <div
              key={market.marketTicker}
              className="flex items-center gap-1.5 shrink-0"
            >
              {/* Event title */}
              <span
                className="text-muted-foreground font-medium truncate max-w-40"
                title={`${market.eventTitle} - ${market.marketTitle}`}
              >
                {market.eventTitle}
              </span>

              {/* Yes Bid with animation */}
              <span
                className={cn(
                  "font-semibold tabular-nums transition-colors duration-300",
                  direction === "up" && "text-green-400",
                  direction === "down" && "text-red-400",
                  !direction && "text-green-500"
                )}
              >
                <AnimateNumber
                  format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
                  suffix="¢"
                  transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
                >
                  {formatPriceCents(market.yesBid)}
                </AnimateNumber>
              </span>

              <span className="text-muted-foreground">/</span>

              {/* Yes Ask with animation */}
              <span
                className={cn(
                  "font-semibold tabular-nums transition-colors duration-300",
                  direction === "up" && "text-green-400",
                  direction === "down" && "text-red-400",
                  !direction && "text-red-500"
                )}
              >
                <AnimateNumber
                  format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
                  suffix="¢"
                  transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
                >
                  {formatPriceCents(market.yesAsk)}
                </AnimateNumber>
              </span>
            </div>
          );
        })}
      </Ticker>
    </div>
  );
}
```

---

## Environment Variables

Ensure these are set in `.env.local`:

```bash
NEXT_PUBLIC_PARTYKIT_HOST=your-partykit-host.partykit.dev
```

---

## Dependencies

Verify `partysocket` is installed:

```bash
pnpm add partysocket
```

---

## Implementation Checklist

- [ ] Install `partysocket` if not already installed
- [ ] Update `hooks/index/useLivePrices.ts`:
  - [ ] Import `fetchSeriesByCategory` and `fetchEventsBySeries` from discover.ts
  - [ ] Add SWR fetch for Crypto series (24h cache)
  - [ ] Add SWR fetch for events filtered by series (1min cache)
  - [ ] Add `eventsToMarketPrices` helper function
  - [ ] Add PartySocket connection to `dflow-relay` room
  - [ ] Add `priceDirection` state map
  - [ ] Filter WS messages to fetched tickers only
  - [ ] Update prices on WS message
  - [ ] Calculate and store price direction
  - [ ] Clear direction after 1s timeout
  - [ ] Add `isConnected` status
- [ ] Update `components/index/MarketTicker.tsx`:
  - [ ] Import `Ticker` and `AnimateNumber` from `motion-plus/react`
  - [ ] Wrap content in `Ticker` with `speed={30}` for continuous scroll
  - [ ] Replace static price spans with `AnimateNumber`
  - [ ] Add direction-based color classes (green-400/red-400 flash)
  - [ ] Add optional connection indicator
- [ ] Test:
  - [ ] Series fetch returns Crypto tickers only
  - [ ] Events fetch filters by series tickers
  - [ ] Initial load shows crypto markets from REST
  - [ ] WebSocket connects and receives updates
  - [ ] Prices animate smoothly on update
  - [ ] Green/red flash appears briefly (1s) on price change
  - [ ] Ticker scrolls continuously

---

## Existing Functions Used (from lib/dflow/prediction-markets/discover.ts)

### `fetchSeriesByCategory(category, options)`

Fetches series filtered by category. Returns `SeriesResponse` with typed series array.

```typescript
const response = await fetchSeriesByCategory("Crypto", { status: "active" });
// response.series = [{ ticker: "KXBTCPRICE", title: "Bitcoin Price", ... }]
```

### `fetchEventsBySeries(seriesTickers, options)`

Fetches events filtered by series tickers. Automatically sets `withNestedMarkets: true`.

```typescript
const response = await fetchEventsBySeries(["KXBTCPRICE", "KXETHPRICE"], { 
  status: "active", 
  limit: 100 
});
// response.events = [{ ticker: "...", title: "...", markets: [...] }]
```

### Types from discover.ts

- `Event` - Event with nested markets
- `Series` - Series metadata
- `SeriesResponse` - { series: Series[] }
- `EventsResponse` - { events: Event[] }

---

## WebSocket Message Format (from dflow-relay)

```typescript
// Price update (channel: "prices")
{
  channel: "prices",
  type: "ticker",
  market_ticker: "KXBTCPRICE-25JAN01-Y",
  yes_bid: "0.52",
  yes_ask: "0.54",
  no_bid: "0.46",
  no_ask: "0.48"
}
```

---

## Notes

- **Reuses existing discover.ts functions** - No duplicate fetch logic, leverages typed API
- **Series are cached for 24h** since they rarely change
- **Events are cached for 1 minute** as a baseline, but WebSocket provides real-time updates
- **Price direction flash lasts 1 second** then returns to default colors
- **Ticker scrolls at speed 30** - adjust if too fast/slow
- **Only Crypto category** is fetched - to add other categories later, make the hook configurable
