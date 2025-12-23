"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Mock prediction market data
const MOCK_MARKETS = [
  { ticker: "TRUMP-WIN", price: 0.62, change: 0.03 },
  { ticker: "BTC-100K", price: 0.45, change: -0.02 },
  { ticker: "FED-CUT", price: 0.78, change: 0.01 },
  { ticker: "ETH-5K", price: 0.31, change: 0.05 },
];

export function MarketTicker() {
  return (
    <div className="flex items-center gap-6 text-sm">
      {MOCK_MARKETS.map((market) => {
        const isPositive = market.change >= 0;
        return (
          <div key={market.ticker} className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-medium">
              {market.ticker}
            </span>
            <span className="font-semibold">${market.price.toFixed(2)}</span>
            <span
              className={cn(
                "flex items-center text-xs font-medium",
                isPositive ? "text-green-500" : "text-red-500"
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3 mr-0.5" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-0.5" />
              )}
              {isPositive ? "+" : ""}
              {(market.change * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
