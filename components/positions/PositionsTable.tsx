"use client";

import { Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DflowPosition } from "@/hooks/positions/usePositions";
import { cn } from "@/lib/utils";

interface PositionsTableProps {
  positions: DflowPosition[];
}

function PositionRow({ position }: { position: DflowPosition }) {
  const isYes = position.outcome === "yes";

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      {/* Market ticker and side badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium font-mono line-clamp-2 flex-1">
          {position.market_ticker}
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

      {/* Wallet address (truncated) */}
      <div className="mt-2 text-xs text-muted-foreground font-mono">
        {position.wallet.slice(0, 4)}...{position.wallet.slice(-4)}
      </div>
    </div>
  );
}

export function PositionsTable({ positions }: PositionsTableProps) {
  // Calculate totals
  const totalQuantity = positions.reduce((sum, p) => sum + p.quantity, 0);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5" />
            Open Positions
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {positions.length} positions
          </span>
        </div>

        {/* Totals summary */}
        {positions.length > 0 && (
          <div className="flex items-center gap-4 mt-2 pt-2 border-t text-sm">
            <div>
              <span className="text-muted-foreground">Total Quantity: </span>
              <span className="font-medium">
                {totalQuantity.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          {positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No open positions</p>
              <p className="text-sm text-muted-foreground/70">
                Positions will appear here when models open trades
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((position, index) => (
                <PositionRow
                  key={`${position.market_ticker}-${position.outcome}-${index}`}
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
