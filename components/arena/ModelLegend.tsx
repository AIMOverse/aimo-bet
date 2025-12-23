"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_ARENA_MODELS, DEFAULT_STARTING_CAPITAL } from "@/lib/arena/constants";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types/arena";

interface ModelLegendProps {
  values: Map<string, number>;
  leaderboard?: LeaderboardEntry[];
  onModelClick?: (modelName: string) => void;
  selectedModel?: string | null;
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

// Format percentage change
function formatChange(value: number, startingCapital: number): string {
  const change = ((value - startingCapital) / startingCapital) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

// Get rank badge style
function getRankStyle(rank: number): string {
  switch (rank) {
    case 1:
      return "text-yellow-500 font-bold";
    case 2:
      return "text-slate-400 font-bold";
    case 3:
      return "text-amber-600 font-bold";
    default:
      return "text-muted-foreground";
  }
}

// Get change indicator component
function ChangeIndicator({ change }: { change: number }) {
  if (change > 0) {
    return <TrendingUp className="h-3 w-3 text-green-500" />;
  }
  if (change < 0) {
    return <TrendingDown className="h-3 w-3 text-red-500" />;
  }
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export function ModelLegend({
  values,
  leaderboard,
  onModelClick,
  selectedModel,
}: ModelLegendProps) {
  // Build model data with rankings
  const modelsWithRank = DEFAULT_ARENA_MODELS.map((model, index) => {
    const value = values.get(model.name) || DEFAULT_STARTING_CAPITAL;
    const entry = leaderboard?.find((e) => e.model.modelIdentifier === model.modelIdentifier);
    return {
      ...model,
      value,
      rank: entry?.rank || index + 1,
      change: entry?.change || 0,
    };
  });

  // Sort by rank (or value if no leaderboard)
  const sortedModels = [...modelsWithRank].sort((a, b) => {
    if (leaderboard) {
      return a.rank - b.rank;
    }
    return b.value - a.value;
  });

  return (
    <Card>
      <CardContent className="py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {sortedModels.map((model) => {
            const isPositive = model.value >= DEFAULT_STARTING_CAPITAL;
            const isSelected = selectedModel === model.name;

            return (
              <button
                key={model.name}
                onClick={() => onModelClick?.(model.name)}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg transition-colors text-left",
                  "hover:bg-muted/50",
                  isSelected && "bg-muted ring-1 ring-primary"
                )}
              >
                {/* Rank indicator */}
                <span className={cn("text-xs w-4", getRankStyle(model.rank))}>
                  #{model.rank}
                </span>

                {/* Color dot */}
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: model.chartColor }}
                />

                {/* Model info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{model.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(model.value)}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isPositive ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {formatChange(model.value, DEFAULT_STARTING_CAPITAL)}
                    </span>
                    <ChangeIndicator change={model.change} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
