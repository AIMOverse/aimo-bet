"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AnimateNumber } from "motion-plus/react";
import {
  type MarketPrice,
  type PriceDirection,
} from "@/hooks/index/useLivePrices";
import { cn } from "@/lib/utils";

// ============================================================================
// Constants
// ============================================================================

const MAX_MARKETS_PER_CARD = 3;

// ============================================================================
// Types
// ============================================================================

interface GroupedEvent {
  eventTicker: string;
  eventTitle: string;
  markets: MarketPrice[];
  isSingleMarket: boolean;
  totalMarkets: number;
}

// ============================================================================
// Props
// ============================================================================

interface MarketTickerProps {
  prices: MarketPrice[];
  priceDirection: Map<string, PriceDirection>;
  isLoading: boolean;
  error: Error | undefined;
  isConnected: boolean;
}

// ============================================================================
// Main Export
// ============================================================================
export function MarketTicker({
  prices,
  priceDirection,
  isLoading,
  error,
  isConnected,
}: MarketTickerProps) {
  // Group markets by eventTicker, sort by volume, limit to 5 events
  const groupedEvents = useMemo(() => {
    const eventMap = new Map<string, GroupedEvent>();

    for (const market of prices) {
      const existing = eventMap.get(market.eventTicker);
      if (existing) {
        existing.markets.push(market);
        existing.isSingleMarket = false;
        existing.totalMarkets += 1;
      } else {
        eventMap.set(market.eventTicker, {
          eventTicker: market.eventTicker,
          eventTitle: market.eventTitle,
          markets: [market],
          isSingleMarket: true,
          totalMarkets: 1,
        });
      }
    }

    // Sort markets within each event by volume (highest first), then limit to MAX_MARKETS_PER_CARD
    for (const group of eventMap.values()) {
      group.markets.sort((a, b) => {
        const volA = a.volume ?? a.volume24h ?? 0;
        const volB = b.volume ?? b.volume24h ?? 0;
        return volB - volA;
      });
      group.markets = group.markets.slice(0, MAX_MARKETS_PER_CARD);
    }

    // Limit to 5 events to fit screen without scrolling
    return Array.from(eventMap.values()).slice(0, 5);
  }, [prices]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-r last:border-r-0 p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    console.error("[MarketTicker] Error loading markets:", error);
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load markets: {error.message}
      </div>
    );
  }

  if (!prices || prices.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No crypto markets available
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Connection indicator */}
      {!isConnected && (
        <div
          className="absolute right-2 top-2 h-2 w-2 rounded-full bg-yellow-500 z-10"
          title="Connecting..."
        />
      )}

      {/* Fixed 5-column grid - no scroll, fits screen */}
      <div className="grid grid-cols-5">
        {groupedEvents.map((group) => (
          <MarketCard
            key={group.eventTicker}
            group={group}
            priceDirection={priceDirection}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Market Card Component
// ============================================================================

function MarketCard({
  group,
  priceDirection,
}: {
  group: GroupedEvent;
  priceDirection: Map<string, PriceDirection>;
}) {
  const cardTitle = group.eventTitle;

  return (
    <div className="border-r last:border-r-0 bg-card p-4 space-y-3">
      {/* Card Title */}
      <h3 className="font-semibold text-sm leading-tight line-clamp-2">
        {cardTitle}
      </h3>

      {/* Markets - different layout for single vs multi */}
      {group.isSingleMarket ? (
        // Single market: full-width progress bar with bid/ask below
        <SingleMarketRow
          market={group.markets[0]}
          direction={priceDirection.get(group.markets[0].marketTicker)}
        />
      ) : (
        // Multi-market: compact horizontal rows
        <div className="space-y-1">
          {group.markets.map((market) => (
            <MultiMarketRow
              key={market.marketTicker}
              market={market}
              direction={priceDirection.get(market.marketTicker)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Single Market Row Component (Full-width progress bar)
// ============================================================================

function SingleMarketRow({
  market,
  direction,
}: {
  market: MarketPrice;
  direction?: PriceDirection;
}) {
  // Convert prices to cents (0-100)
  const bidCents =
    market.yesBid !== null
      ? market.yesBid > 1
        ? market.yesBid
        : Math.round(market.yesBid * 100)
      : 0;
  const askCents =
    market.yesAsk !== null
      ? market.yesAsk > 1
        ? market.yesAsk
        : Math.round(market.yesAsk * 100)
      : 0;

  // Use midpoint for the progress bar display
  const midpoint = (bidCents + askCents) / 2;

  return (
    <div className="space-y-1.5">
      {/* Progress bar showing bid-ask spread */}
      <Progress
        value={midpoint}
        className={cn(
          "h-3 bg-red-500/30",
          "[&>[data-slot=progress-indicator]]:bg-green-500",
          "[&>[data-slot=progress-indicator]]:transition-transform",
          "[&>[data-slot=progress-indicator]]:duration-500",
          "[&>[data-slot=progress-indicator]]:ease-out",
        )}
      />

      {/* Bid/Ask labels */}
      <div className="flex justify-between text-xs tabular-nums">
        <span
          className={cn(
            "font-medium transition-colors duration-300",
            direction === "up" && "text-green-400",
            direction === "down" && "text-red-400",
            !direction && "text-green-500",
          )}
        >
          <AnimateNumber
            format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
            suffix="¢"
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
          >
            {bidCents}
          </AnimateNumber>
          {" bid"}
        </span>
        <span
          className={cn(
            "font-medium transition-colors duration-300",
            direction === "up" && "text-green-400",
            direction === "down" && "text-red-400",
            !direction && "text-red-500",
          )}
        >
          <AnimateNumber
            format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
            suffix="¢"
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
          >
            {askCents}
          </AnimateNumber>
          {" ask"}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Multi Market Row Component (Compact horizontal layout)
// ============================================================================

function MultiMarketRow({
  market,
  direction,
}: {
  market: MarketPrice;
  direction?: PriceDirection;
}) {
  // Convert prices to cents (0-100)
  const bidCents =
    market.yesBid !== null
      ? market.yesBid > 1
        ? market.yesBid
        : Math.round(market.yesBid * 100)
      : 0;
  const askCents =
    market.yesAsk !== null
      ? market.yesAsk > 1
        ? market.yesAsk
        : Math.round(market.yesAsk * 100)
      : 0;

  // Use midpoint for the progress bar display
  const midpoint = (bidCents + askCents) / 2;

  return (
    <div className="flex items-center gap-1.5">
      {/* Market title */}
      <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
        {market.marketTitle}
      </span>

      {/* Mini progress bar */}
      <Progress
        value={midpoint}
        className={cn(
          "h-1.5 w-12 shrink-0 bg-red-500/30",
          "[&>[data-slot=progress-indicator]]:bg-green-500",
          "[&>[data-slot=progress-indicator]]:transition-transform",
          "[&>[data-slot=progress-indicator]]:duration-500",
          "[&>[data-slot=progress-indicator]]:ease-out",
        )}
      />

      {/* Bid/Ask prices */}
      <div className="flex items-center gap-0.5 text-[10px] tabular-nums shrink-0">
        <span
          className={cn(
            "font-medium transition-colors duration-300",
            direction === "up" && "text-green-400",
            direction === "down" && "text-red-400",
            !direction && "text-green-500",
          )}
        >
          <AnimateNumber
            format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
            suffix="¢"
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
          >
            {bidCents}
          </AnimateNumber>
        </span>
        <span className="text-muted-foreground">/</span>
        <span
          className={cn(
            "font-medium transition-colors duration-300",
            direction === "up" && "text-green-400",
            direction === "down" && "text-red-400",
            !direction && "text-red-500",
          )}
        >
          <AnimateNumber
            format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
            suffix="¢"
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
          >
            {askCents}
          </AnimateNumber>
        </span>
      </div>
    </div>
  );
}
