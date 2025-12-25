"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useLivePrices, type MarketPrice } from "@/hooks/index/useLivePrices";

const MAX_DISPLAY_MARKETS = 4;

export function MarketTicker() {
  const { prices, isLoading, error } = useLivePrices();

  if (isLoading) {
    return (
      <div className="flex items-center gap-6">
        {Array.from({ length: MAX_DISPLAY_MARKETS }).map((_, i) => (
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

  // Take first N markets to display
  const displayMarkets = prices.slice(0, MAX_DISPLAY_MARKETS);

  if (displayMarkets.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No markets available</div>
    );
  }

  // Format price as percentage (0-100 scale, assuming prices are 0-1)
  const formatPrice = (price: number | null): string => {
    if (price === null) return "-";
    // If price is already in cents (0-100), display as is
    // If price is in decimal (0-1), multiply by 100
    const cents = price > 1 ? price : Math.round(price * 100);
    return `${cents}¢`;
  };

  return (
    <div className="flex items-center gap-6 text-sm">
      {displayMarkets.map((market: MarketPrice) => (
        <div key={market.marketTicker} className="flex items-center gap-1.5">
          <span
            className="text-muted-foreground font-medium truncate max-w-40"
            title={`${market.eventTitle} - ${market.marketTitle}`}
          >
            {market.eventTitle}
          </span>
          <span className="font-semibold text-green-500">
            {formatPrice(market.yesBid)}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold text-red-500">
            {formatPrice(market.yesAsk)}
          </span>
        </div>
      ))}
    </div>
  );
}
