"use client";

import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { DflowTradeWithModel } from "@/hooks/trades/useTrades";
import { cn } from "@/lib/utils";

interface TradeCardProps {
  trade: DflowTradeWithModel;
  showReasoning?: boolean;
}

// Format time ago
function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
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

export function TradeCard({ trade }: TradeCardProps) {
  const isBuy = trade.action === "buy";
  const isYes = trade.side === "yes";

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: trade.model.chartColor }}
          />
          <span className="font-medium text-sm">{trade.model.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTimeAgo(trade.timestamp)}
        </span>
      </div>

      {/* Trade action */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
            isBuy
              ? "bg-green-500/10 text-green-500"
              : "bg-red-500/10 text-red-500",
          )}
        >
          {isBuy ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {trade.action.toUpperCase()}
        </span>
        <span
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            isYes
              ? "bg-blue-500/10 text-blue-500"
              : "bg-orange-500/10 text-orange-500",
          )}
        >
          {trade.side.toUpperCase()}
        </span>
      </div>

      {/* Market ticker */}
      <p className="text-sm mb-2 line-clamp-2 font-mono">
        {trade.market_ticker}
      </p>

      {/* Trade details */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {trade.quantity} @ {formatCurrency(trade.price)}
        </span>
        <span className="font-medium text-foreground">
          {formatCurrency(trade.total)}
        </span>
      </div>

      {/* Transaction signature link */}
      {trade.tx_signature && (
        <a
          href={`https://solscan.io/tx/${trade.tx_signature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-xs text-blue-500 hover:underline block truncate"
        >
          View on Solscan
        </a>
      )}
    </div>
  );
}
