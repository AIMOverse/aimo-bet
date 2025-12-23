"use client";

import { Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Position } from "@/types/arena";
import { cn } from "@/lib/utils";

interface PositionsTableProps {
  positions: Position[];
}

// Format currency
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Format date
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function PositionRow({ position }: { position: Position }) {
  const isYes = position.side === "yes";
  const hasPnL = position.unrealizedPnl !== undefined;
  const isPositivePnL = hasPnL && position.unrealizedPnl! >= 0;

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      {/* Market title and side badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium line-clamp-2 flex-1">
          {position.marketTitle}
        </p>
        <span
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium shrink-0",
            isYes
              ? "bg-blue-500/10 text-blue-500"
              : "bg-orange-500/10 text-orange-500"
          )}
        >
          {position.side.toUpperCase()}
        </span>
      </div>

      {/* Position details grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Quantity</span>
          <p className="font-medium">{position.quantity}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Avg Entry</span>
          <p className="font-medium">{formatCurrency(position.avgEntryPrice)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Current Price</span>
          <p className="font-medium">
            {position.currentPrice !== undefined
              ? formatCurrency(position.currentPrice)
              : "N/A"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Value</span>
          <p className="font-medium">
            {position.currentValue !== undefined
              ? formatCurrency(position.currentValue)
              : "N/A"}
          </p>
        </div>
      </div>

      {/* P&L */}
      {hasPnL && (
        <div
          className={cn(
            "mt-3 pt-2 border-t flex items-center justify-between",
            isPositivePnL ? "text-green-500" : "text-red-500"
          )}
        >
          <span className="text-xs font-medium">Unrealized P&L</span>
          <span className="font-medium">
            {isPositivePnL ? "+" : ""}
            {formatCurrency(position.unrealizedPnl!)}
          </span>
        </div>
      )}

      {/* Opened date */}
      <div className="mt-2 text-xs text-muted-foreground">
        Opened {formatDate(position.openedAt)}
      </div>
    </div>
  );
}

export function PositionsTable({ positions }: PositionsTableProps) {
  const openPositions = positions.filter((p) => p.status === "open");

  // Calculate totals
  const totalValue = openPositions.reduce(
    (sum, p) => sum + (p.currentValue || 0),
    0
  );
  const totalPnL = openPositions.reduce(
    (sum, p) => sum + (p.unrealizedPnl || 0),
    0
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5" />
            Open Positions
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {openPositions.length} positions
          </span>
        </div>

        {/* Totals summary */}
        {openPositions.length > 0 && (
          <div className="flex items-center gap-4 mt-2 pt-2 border-t text-sm">
            <div>
              <span className="text-muted-foreground">Total Value: </span>
              <span className="font-medium">{formatCurrency(totalValue)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total P&L: </span>
              <span
                className={cn(
                  "font-medium",
                  totalPnL >= 0 ? "text-green-500" : "text-red-500"
                )}
              >
                {totalPnL >= 0 ? "+" : ""}
                {formatCurrency(totalPnL)}
              </span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          {openPositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No open positions</p>
              <p className="text-sm text-muted-foreground/70">
                Positions will appear here when models open trades
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {openPositions.map((position) => (
                <PositionRow key={position.id} position={position} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
