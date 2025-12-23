"use client";

import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LeaderboardEntry } from "@/types/arena";
import { cn } from "@/lib/utils";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

// Format currency
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Get rank badge style
function getRankBadge(rank: number): { bg: string; text: string } {
  switch (rank) {
    case 1:
      return { bg: "bg-yellow-500/10", text: "text-yellow-500" };
    case 2:
      return { bg: "bg-slate-300/10", text: "text-slate-400" };
    case 3:
      return { bg: "bg-amber-600/10", text: "text-amber-600" };
    default:
      return { bg: "bg-muted", text: "text-muted-foreground" };
  }
}

// Get change indicator
function ChangeIndicator({ change }: { change: number }) {
  if (change > 0) {
    return (
      <span className="flex items-center text-green-500 text-xs">
        <TrendingUp className="h-3 w-3 mr-0.5" />
        {change}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="flex items-center text-red-500 text-xs">
        <TrendingDown className="h-3 w-3 mr-0.5" />
        {Math.abs(change)}
      </span>
    );
  }
  return (
    <span className="flex items-center text-muted-foreground text-xs">
      <Minus className="h-3 w-3" />
    </span>
  );
}

export function Leaderboard({ entries }: LeaderboardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map((entry) => {
          const rankStyle = getRankBadge(entry.rank);
          const isPositive = entry.returnPercent >= 0;

          return (
            <div
              key={entry.model.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg",
                "bg-muted/30 hover:bg-muted/50 transition-colors"
              )}
            >
              {/* Rank badge */}
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                  rankStyle.bg,
                  rankStyle.text
                )}
              >
                {entry.rank}
              </div>

              {/* Model info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: entry.model.chartColor }}
                  />
                  <span className="font-medium truncate">{entry.model.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency(entry.portfolio.totalValue)}
                  </span>
                  <ChangeIndicator change={entry.change} />
                </div>
              </div>

              {/* Return percentage */}
              <div
                className={cn(
                  "text-right font-medium",
                  isPositive ? "text-green-500" : "text-red-500"
                )}
              >
                {isPositive ? "+" : ""}
                {entry.returnPercent.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
