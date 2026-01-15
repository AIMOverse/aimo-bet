"use client";

import { useMemo } from "react";
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { AgentTrade } from "@/hooks/trades/useTrades";
import { useTradePrices } from "@/hooks/trades/useTradePrices";
import type { PriceDirection } from "@/hooks/usePriceSubscription";
import { getModelSeriesIcon } from "@/components/icons/model-series";

interface PlatformConfig {
  label: string;
  logoPath: string;
  color: string;
  bgColor: string;
  explorerLabel: string;
  explorerUrlTemplate: (signature: string) => string;
}

const PLATFORM_CONFIG: Record<"kalshi" | "polymarket", PlatformConfig> = {
  kalshi: {
    label: "Kalshi",
    logoPath: "/prediction-markets/kalshi.svg",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    explorerLabel: "View on Solscan",
    explorerUrlTemplate: (sig: string) => `https://solscan.io/tx/${sig}`,
  },
  polymarket: {
    label: "Polymarket",
    logoPath: "/prediction-markets/polymarket.svg",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    explorerLabel: "View on Polygonscan",
    explorerUrlTemplate: (sig: string) => `https://polygonscan.com/tx/${sig}`,
  },
} as const;

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

// Format price as cents
function formatCents(value: number): string {
  return `${Math.round(value * 100)}¢`;
}

// Format currency for notional
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Extract base58 signature from txSignature (removes exchange prefix like "kalshi:")
function extractSignature(txSignature: string): string {
  if (!txSignature) return "";
  const colonIndex = txSignature.indexOf(":");
  return colonIndex !== -1 ? txSignature.slice(colonIndex + 1) : txSignature;
}

interface TradeCardProps {
  trade: AgentTrade;
  currentPrice?: number;
  priceDirection?: PriceDirection;
}

function TradeCard({ trade, currentPrice, priceDirection }: TradeCardProps) {
  const isBuy = trade.action === "buy";
  const isYes = trade.side === "yes";
  const modelName = trade.modelName || "Model";
  const chartColor = trade.modelColor || "#6366f1";
  const icon = getModelSeriesIcon(trade.modelSeries);
  const initial = modelName.charAt(0).toUpperCase();

  const platform = PLATFORM_CONFIG[trade.platform];
  const signature = extractSignature(trade.txSignature ?? "");
  const explorerUrl = platform.explorerUrlTemplate(signature);

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Avatar
            className="size-5 ring-[1.5px] ring-offset-0 bg-background shrink-0"
            style={{
              ["--tw-ring-color" as string]: chartColor,
            }}
          >
            {icon?.type === "component" ? (
              <div className="flex items-center justify-center w-full h-full p-0.5">
                <icon.Component className="size-3.5" />
              </div>
            ) : icon?.type === "image" ? (
              <AvatarImage
                src={icon.src}
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
          <span
            className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium",
              platform.bgColor,
              platform.color,
            )}
          >
            <Avatar className="size-4 rounded-sm">
              <AvatarImage src={platform.logoPath} alt={platform.label} />
            </Avatar>
            {platform.label}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTimeAgo(trade.createdAt)}
        </span>
      </div>

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

      <p className="text-sm mb-2 line-clamp-2">
        {trade.marketTitle || trade.marketTicker}
      </p>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex flex-col">
          <span>
            {trade.quantity} @ {formatCents(trade.price)}
          </span>
          {currentPrice !== undefined && (
            <span
              className={cn(
                "text-[10px] transition-colors",
                priceDirection === "up" && "text-green-500",
                priceDirection === "down" && "text-red-500",
              )}
            >
              Now: {formatCents(currentPrice)}
            </span>
          )}
        </div>
        <span
          className={cn(
            "font-medium text-foreground px-1.5 py-0.5 rounded transition-all",
            priceDirection === "up" && "ring-2 ring-green-400",
            priceDirection === "down" && "ring-2 ring-red-400",
          )}
        >
          {formatCurrency(trade.notional)}
        </span>
      </div>

      {trade.txSignature && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-xs text-blue-500 hover:underline flex items-center gap-1"
        >
          {platform.explorerLabel}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export function TradesFeed({ trades, selectedModelId }: TradesFeedProps) {
  // Subscribe to live price updates for all trades
  const { prices, priceDirection, isConnected } = useTradePrices(trades);

  // Filter trades by selected model only
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      if (selectedModelId && trade.modelId !== selectedModelId) {
        return false;
      }
      return true;
    });
  }, [trades, selectedModelId]);

  // Check if any connection is active
  const hasConnection = isConnected.kalshi || isConnected.polymarket;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-end">
        {trades.length > 0 && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs",
              hasConnection ? "text-green-500" : "text-muted-foreground",
            )}
            title={
              hasConnection
                ? `Connected: ${[
                    isConnected.kalshi && "Kalshi",
                    isConnected.polymarket && "Polymarket",
                  ]
                    .filter(Boolean)
                    .join(", ")}`
                : "Disconnected"
            }
          >
            {hasConnection ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
          </div>
        )}
      </CardHeader>

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
              {filteredTrades.map((trade) => {
                const priceUpdate = prices.get(trade.marketTicker);
                const currentPrice = priceUpdate
                  ? trade.side === "yes"
                    ? priceUpdate.yesPrice
                    : priceUpdate.noPrice
                  : undefined;

                return (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    currentPrice={currentPrice}
                    priceDirection={priceDirection.get(trade.marketTicker)}
                  />
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
