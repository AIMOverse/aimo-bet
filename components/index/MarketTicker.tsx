"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AnimateNumber, Ticker } from "motion-plus/react";
import { cn } from "@/lib/utils";
import type {
  TickerMarket,
  Platform,
  Category,
} from "@/hooks/index/useTickerMarkets";
import Image from "next/image";

// ============================================================================
// Constants
// ============================================================================

const MAX_MARKETS_PER_CARD = 3;
const MAX_EVENTS_TO_SHOW = 5;

// Category colors
const CATEGORY_COLORS: Record<Category, string> = {
  politics: "bg-blue-500",
  sports: "bg-green-500",
  crypto: "bg-orange-500",
};

// Platform logo paths
const PLATFORM_LOGOS: Record<Platform, string> = {
  kalshi: "/prediction-markets/kalshi.svg",
  polymarket: "/prediction-markets/polymarket.svg",
};

// ============================================================================
// Types
// ============================================================================

export type PriceDirection = "up" | "down" | "neutral";

interface GroupedEvent {
  eventTicker: string;
  eventTitle: string;
  markets: TickerMarket[];
  isSingleMarket: boolean;
  totalMarkets: number;
  platform: Platform;
  category: Category;
}

interface MarketTickerProps {
  markets: TickerMarket[];
  priceDirection: Map<string, PriceDirection>;
  isLoading: boolean;
  error: Error | undefined;
  isConnected: { kalshi: boolean; polymarket: boolean };
}

// ============================================================================
// Main Export
// ============================================================================

export function MarketTicker({
  markets,
  priceDirection,
  isLoading,
  error,
  isConnected,
}: MarketTickerProps) {
  // Group markets by eventTicker, sort by volume, limit to MAX_EVENTS_TO_SHOW
  const groupedEvents = useMemo(() => {
    const eventMap = new Map<string, GroupedEvent>();

    for (const market of markets) {
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
          platform: market.platform,
          category: market.category,
        });
      }
    }

    // Sort markets within each event by volume (highest first), then limit to MAX_MARKETS_PER_CARD
    for (const group of eventMap.values()) {
      group.markets.sort((a, b) => b.volume - a.volume);
      group.markets = group.markets.slice(0, MAX_MARKETS_PER_CARD);
    }

    // Separate events by platform and sort each by volume
    const allEvents = Array.from(eventMap.values());
    const polymarketEvents = allEvents
      .filter((e) => e.platform === "polymarket")
      .sort((a, b) => {
        const volA = a.markets.reduce((sum, m) => sum + m.volume, 0);
        const volB = b.markets.reduce((sum, m) => sum + m.volume, 0);
        return volB - volA;
      });
    const kalshiEvents = allEvents
      .filter((e) => e.platform === "kalshi")
      .sort((a, b) => {
        const volA = a.markets.reduce((sum, m) => sum + m.volume, 0);
        const volB = b.markets.reduce((sum, m) => sum + m.volume, 0);
        return volB - volA;
      });

    // Interleave: polymarket, kalshi, polymarket, kalshi, ...
    const interleaved: GroupedEvent[] = [];
    const maxLen = Math.max(polymarketEvents.length, kalshiEvents.length);
    for (
      let i = 0;
      i < maxLen && interleaved.length < MAX_EVENTS_TO_SHOW;
      i++
    ) {
      if (polymarketEvents[i] && interleaved.length < MAX_EVENTS_TO_SHOW) {
        interleaved.push(polymarketEvents[i]);
      }
      if (kalshiEvents[i] && interleaved.length < MAX_EVENTS_TO_SHOW) {
        interleaved.push(kalshiEvents[i]);
      }
    }

    return interleaved;
  }, [markets]);

  // Check if any platform is connected
  const anyConnected = isConnected.kalshi || isConnected.polymarket;

  // Loading state
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

  // Error state
  if (error) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        Failed to load markets: {error.message}
      </div>
    );
  }

  // Empty state
  if (!markets || markets.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No markets available
      </div>
    );
  }

  // Build ticker items from grouped events
  const tickerItems = groupedEvents.map((group) => (
    <EventCard
      key={group.eventTicker}
      group={group}
      priceDirection={priceDirection}
    />
  ));

  return (
    <div className="relative">
      {/* Connection indicator */}
      {!anyConnected && (
        <div
          className="absolute right-2 top-2 h-2 w-2 rounded-full bg-yellow-500 z-10"
          title="Connecting..."
        />
      )}

      {/* Infinite scroll ticker */}
      <Ticker items={tickerItems} hoverFactor={0} />
    </div>
  );
}

// ============================================================================
// Event Card Component (groups multiple markets from same event)
// ============================================================================

function EventCard({
  group,
  priceDirection,
}: {
  group: GroupedEvent;
  priceDirection: Map<string, PriceDirection>;
}) {
  const platformLogo = PLATFORM_LOGOS[group.platform];
  const categoryColor = CATEGORY_COLORS[group.category];

  return (
    <div className="w-72 shrink-0 border-r bg-card p-4 space-y-3">
      {/* Header: Platform logo + Category indicator + Title */}
      <div className="flex items-start gap-2">
        {/* Platform logo */}
        <Image
          src={platformLogo}
          alt={group.platform}
          width={64}
          height={16}
          className={cn(
            "shrink-0 h-4 w-auto mt-0.5",
            group.platform === "kalshi" && "dark:invert",
          )}
          title={group.platform === "kalshi" ? "Kalshi" : "Polymarket"}
        />

        {/* Category indicator */}
        <span
          className={cn(
            "shrink-0 w-1.5 h-1.5 rounded-full mt-1.5",
            categoryColor,
          )}
          title={group.category}
        />

        {/* Card Title */}
        <h3 className="font-semibold text-sm leading-tight line-clamp-2 flex-1">
          {group.eventTitle}
        </h3>
      </div>

      {/* Markets - different layout for single vs multi */}
      {group.isSingleMarket ? (
        // Single market: full-width progress bar with Yes/No prices below
        <SingleMarketRow
          market={group.markets[0]}
          direction={priceDirection.get(group.markets[0].ticker)}
        />
      ) : (
        // Multi-market: compact horizontal rows
        <div className="space-y-1.5">
          {group.markets.map((market) => (
            <MultiMarketRow
              key={market.ticker}
              market={market}
              direction={priceDirection.get(market.ticker)}
            />
          ))}
          {/* Show count of additional markets if any */}
          {group.totalMarkets > MAX_MARKETS_PER_CARD && (
            <p className="text-[10px] text-muted-foreground text-center">
              +{group.totalMarkets - MAX_MARKETS_PER_CARD} more markets
            </p>
          )}
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
  market: TickerMarket;
  direction?: PriceDirection;
}) {
  // yesPrice and noPrice are already in cents (0-100)
  const yesPercent = Number.isFinite(market.yesPrice) ? market.yesPrice : 50;
  const noPercent = Number.isFinite(market.noPrice) ? market.noPrice : 50;

  return (
    <div className="space-y-1.5">
      {/* Market title if different from event title */}
      {market.marketTitle !== market.eventTitle && (
        <p className="text-[10px] text-muted-foreground line-clamp-1 -mt-1">
          {market.marketTitle}
        </p>
      )}

      {/* Progress bar */}
      <Progress
        value={yesPercent}
        className={cn(
          "h-3 bg-red-500/30",
          "[&>[data-slot=progress-indicator]]:bg-green-500",
          "[&>[data-slot=progress-indicator]]:transition-transform",
          "[&>[data-slot=progress-indicator]]:duration-500",
          "[&>[data-slot=progress-indicator]]:ease-out",
        )}
      />

      {/* Yes/No prices */}
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
            {Math.round(yesPercent)}
          </AnimateNumber>
          {" Yes"}
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
            {Math.round(noPercent)}
          </AnimateNumber>
          {" No"}
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
  market: TickerMarket;
  direction?: PriceDirection;
}) {
  // yesPrice and noPrice are already in cents (0-100)
  const yesPercent = Number.isFinite(market.yesPrice) ? market.yesPrice : 50;
  const noPercent = Number.isFinite(market.noPrice) ? market.noPrice : 50;

  return (
    <div className="flex items-center gap-1.5">
      {/* Market title */}
      <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
        {market.marketTitle}
      </span>

      {/* Mini progress bar */}
      <Progress
        value={yesPercent}
        className={cn(
          "h-1.5 w-12 shrink-0 bg-red-500/30",
          "[&>[data-slot=progress-indicator]]:bg-green-500",
          "[&>[data-slot=progress-indicator]]:transition-transform",
          "[&>[data-slot=progress-indicator]]:duration-500",
          "[&>[data-slot=progress-indicator]]:ease-out",
        )}
      />

      {/* Yes/No prices */}
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
            {Math.round(yesPercent)}
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
            {Math.round(noPercent)}
          </AnimateNumber>
        </span>
      </div>
    </div>
  );
}
