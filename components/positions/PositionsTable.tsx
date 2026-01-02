"use client";

import { useMemo } from "react";
import { Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DflowPosition } from "@/hooks/positions/usePositions";
import { cn } from "@/lib/utils";

interface PositionsTableProps {
  positions: DflowPosition[];
  selectedModelId?: string | null;
}

function PositionRow({ position }: { position: DflowPosition }) {
  const isYes = position.outcome === "yes";

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      {/* Market ticker and side badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium font-mono line-clamp-2 flex-1">
          {position.marketTicker}
        </p>
        <span
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium shrink-0",
            isYes
              ? "bg-blue-500/10 text-blue-500"
              : "bg-orange-500/10 text-orange-500",
          )}
        >
          {position.outcome.toUpperCase()}
        </span>
      </div>

      {/* Position details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Quantity</span>
          <p className="font-medium">{position.quantity.toLocaleString()}</p>
        </div>
        {position.modelName && (
          <div>
            <span className="text-muted-foreground">Model</span>
            <p className="font-medium">{position.modelName}</p>
          </div>
        )}
      </div>

      {/* Mint address (truncated) */}
      <div className="mt-2 text-xs text-muted-foreground font-mono">
        {position.mint.slice(0, 4)}...{position.mint.slice(-4)}
      </div>
    </div>
  );
}

export function PositionsTable({
  positions,
  selectedModelId,
}: PositionsTableProps) {
  // Filter positions by selected model
  const filteredPositions = useMemo(() => {
    if (!selectedModelId) return positions;
    return positions.filter((p) => p.modelId === selectedModelId);
  }, [positions, selectedModelId]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3"></CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          {filteredPositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No open positions</p>
              <p className="text-sm text-muted-foreground/70">
                Positions will appear here when models open trades
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPositions.map((position, index) => (
                <PositionRow
                  key={`${position.marketTicker}-${position.outcome}-${index}`}
                  position={position}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
