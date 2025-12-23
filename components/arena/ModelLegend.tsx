"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_ARENA_MODELS, DEFAULT_STARTING_CAPITAL } from "@/lib/arena/constants";
import { cn } from "@/lib/utils";

interface ModelLegendProps {
  values: Map<string, number>;
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

export function ModelLegend({
  values,
  onModelClick,
  selectedModel,
}: ModelLegendProps) {
  // Sort models by current value (descending)
  const sortedModels = [...DEFAULT_ARENA_MODELS].sort((a, b) => {
    const valueA = values.get(a.name) || DEFAULT_STARTING_CAPITAL;
    const valueB = values.get(b.name) || DEFAULT_STARTING_CAPITAL;
    return valueB - valueA;
  });

  return (
    <Card>
      <CardContent className="py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {sortedModels.map((model) => {
            const value = values.get(model.name) || DEFAULT_STARTING_CAPITAL;
            const change = value - DEFAULT_STARTING_CAPITAL;
            const isPositive = change >= 0;
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
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: model.chartColor }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{model.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(value)}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isPositive ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {formatChange(value, DEFAULT_STARTING_CAPITAL)}
                    </span>
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
