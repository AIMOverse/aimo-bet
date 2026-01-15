"use client";

import { Ticker } from "motion-plus/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AnimateNumber } from "motion-plus/react";
import { cn } from "@/lib/utils";
import type {
  TickerMarket,
  Platform,
  Category,
} from "@/hooks/index/useTickerMarkets";

// ============================================================================
// Constants
// ============================================================================

const TICKER_VELOCITY = 40; // pixels per second
const TICKER_GAP = 16; // gap between items in pixels

// Category colors
const CATEGORY_COLORS: Record<Category, string> = {
  politics: "bg-blue-500",
  sports: "bg-green-500",
  crypto: "bg-orange-500",
};

// Platform badges
const PLATFORM_BADGE: Record<Platform, { label: string; className: string }> = {
  kalshi: {
    label: "K",
    className: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  polymarket: {
    label: "P",
    className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
};

// ============================================================================
// Types
// ============================================================================

export type PriceDirection = "up" | "down" | "neutral";

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
  // Check if any platform is connected
  const anyConnected = isConnected.kalshi || isConnected.polymarket;

  if (isLoading) {
    return (
      <div className="flex gap-4 p-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 w-64 border rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="h-3 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    console.error("[MarketTicker] Error loading markets:", error);
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Failed to load markets: {error.message}
      </div>
    );
  }

  // Ensure markets is always a valid array to prevent race conditions with Ticker component
  const safeMarkets = markets ?? [];

  if (safeMarkets.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No markets available
      </div>
    );
  }

  return (
    <div className="relative py-3">
      {/* Connection indicator */}
      {!anyConnected && (
        <div
          className="absolute right-3 top-3 h-2 w-2 rounded-full bg-yellow-500 z-10"
          title="Connecting to live prices..."
        />
      )}

      {/* Auto-scrolling ticker - pauses on hover */}
      <Ticker velocity={TICKER_VELOCITY} gap={TICKER_GAP} hoverFactor={0}>
        {safeMarkets.map((market) => (
          <MarketCard
            key={`${market.platform}-${market.ticker}`}
            market={market}
            direction={priceDirection.get(market.ticker)}
          />
        ))}
      </Ticker>
    </div>
  );
}

// ============================================================================
// Market Card Component
// ============================================================================

function MarketCard({
  market,
  direction,
}: {
  market: TickerMarket;
  direction?: PriceDirection;
}) {
  const platformBadge = PLATFORM_BADGE[market.platform];
  const categoryColor = CATEGORY_COLORS[market.category];

  // Use yesPrice for progress bar (already in cents 0-100)
  const yesPercent = market.yesPrice;
  const noPercent = market.noPrice;

  return (
    <div className="shrink-0 w-64 border rounded-lg bg-card p-3 space-y-2">
      {/* Header: Platform badge + Category indicator + Title */}
      <div className="flex items-start gap-2">
        {/* Platform badge */}
        <span
          className={cn(
            "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border",
            platformBadge.className,
          )}
          title={market.platform === "kalshi" ? "Kalshi" : "Polymarket"}
        >
          {platformBadge.label}
        </span>

        {/* Category indicator */}
        <span
          className={cn(
            "shrink-0 w-1.5 h-1.5 rounded-full mt-1.5",
            categoryColor,
          )}
          title={market.category}
        />

        {/* Title */}
        <h3 className="font-medium text-sm leading-tight line-clamp-2 flex-1">
          {market.eventTitle}
        </h3>
      </div>

      {/* Market subtitle if different from event title */}
      {market.marketTitle !== market.eventTitle && (
        <p className="text-[10px] text-muted-foreground line-clamp-1 -mt-1">
          {market.marketTitle}
        </p>
      )}

      {/* Progress bar */}
      <Progress
        value={yesPercent}
        className={cn(
          "h-2.5 bg-red-500/30",
          "[&>[data-slot=progress-indicator]]:bg-green-500",
          "[&>[data-slot=progress-indicator]]:transition-transform",
          "[&>[data-slot=progress-indicator]]:duration-500",
          "[&>[data-slot=progress-indicator]]:ease-out",
        )}
      />

      {/* Prices */}
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
