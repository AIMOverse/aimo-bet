"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useLivePrices, type MarketPrice } from "@/hooks/index/useLivePrices";

const MAX_DISPLAY_MARKETS = 4;

export function MarketTicker() {
  const { prices, priceMap, isLoading } = useLivePrices();

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

  // Take first N markets to display
  const displayMarkets = prices.slice(0, MAX_DISPLAY_MARKETS);

  if (displayMarkets.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No markets available</div>
    );
  }

  return (
    <div className="flex items-center gap-6 text-sm">
      {displayMarkets.map((market: MarketPrice) => (
        <div key={market.marketTicker} className="flex items-center gap-1.5">
          <span className="text-muted-foreground font-medium truncate max-w-32">
            {market.marketTicker}
          </span>
          <span className="font-semibold text-green-500">
            {market.yesBid ?? "-"}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold text-red-500">
            {market.yesAsk ?? "-"}
          </span>
        </div>
      ))}
    </div>
  );
}
