"use client";

import { useMemo } from "react";
import { ArrowRightLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { AgentTrade } from "@/hooks/trades/useTrades";

// Map series to logo filename
const SERIES_LOGO_MAP: Record<string, string> = {
  openai: "openai.svg",
  claude: "claude-color.svg",
  gemini: "gemini-color.svg",
  deepseek: "deepseek-color.svg",
  qwen: "qwen-color.svg",
  grok: "grok.svg",
  kimi: "kimi-color.svg",
  glm: "zai.svg",
};

function getLogoPathFromSeries(series?: string): string | undefined {
  if (!series) return undefined;
  const filename = SERIES_LOGO_MAP[series];
  return filename ? `/model-series/${filename}` : undefined;
}

interface TradesFeedProps {
  trades: AgentTrade[];
  selectedModelId: string | null;
}

// Format time ago
function formatTimeAgo(timestamp: Date | string): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
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

function TradeCard({ trade }: { trade: AgentTrade }) {
  const isBuy = trade.action === "buy";
  const isYes = trade.side === "yes";
  const modelName = trade.modelName || "Model";
  const chartColor = trade.modelColor || "#6366f1";
  const logoPath = getLogoPathFromSeries(trade.modelSeries);
  const initial = modelName.charAt(0).toUpperCase();

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Avatar
            className="size-5 ring-[1.5px] ring-offset-0 bg-background shrink-0"
            style={{
              ["--tw-ring-color" as string]: chartColor,
            }}
          >
            {logoPath ? (
              <AvatarImage
                src={logoPath}
                alt={`${modelName} logo`}
                className="p-0.5"
              />
            ) : null}
            <AvatarFallback
              className="text-[10px] font-semibold text-foreground"
              style={{ backgroundColor: `${chartColor}20` }}
            >
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-sm">{modelName}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTimeAgo(trade.createdAt)}
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
        {trade.marketTicker}
      </p>

      {/* Trade details */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {trade.quantity} @ {formatCurrency(trade.price)}
        </span>
        <span className="font-medium text-foreground">
          {formatCurrency(trade.notional)}
        </span>
      </div>

      {/* Transaction signature link */}
      {trade.txSignature && (
        <a
          href={`https://solscan.io/tx/${trade.txSignature}`}
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

export function TradesFeed({ trades, selectedModelId }: TradesFeedProps) {
  // Filter trades by selected model only
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      if (selectedModelId && trade.modelId !== selectedModelId) {
        return false;
      }
      return true;
    });
  }, [trades, selectedModelId]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3"></CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          {filteredTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ArrowRightLeft className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No trades yet</p>
              <p className="text-sm text-muted-foreground/70">
                Trades will appear here once models start trading
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTrades.map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
