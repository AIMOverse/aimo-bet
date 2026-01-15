"use client";

import { useMemo } from "react";
import { Briefcase, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { AgentPosition } from "@/hooks/positions/usePositions";
import { usePositionPrices } from "@/hooks/positions/usePositionPrices";
import type { PriceDirection } from "@/hooks/positions/usePriceSubscription";
import { cn } from "@/lib/utils";
import { AnimateNumber } from "motion-plus/react";

const DEFAULT_CHART_COLOR = "#6366f1";

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

interface PositionsTableProps {
  positions: AgentPosition[];
  selectedModelId?: string | null;
}

interface PositionWithPrice extends AgentPosition {
  livePrice: number | undefined;
  priceDirection?: PriceDirection;
}

interface MarketGroup {
  marketTicker: string;
  marketTitle?: string;
  positions: PositionWithPrice[];
  yesPosition?: PositionWithPrice;
  noPosition?: PositionWithPrice;
}

interface ModelGroup {
  modelId: string;
  modelName: string;
  modelColor: string;
  modelSeries?: string;
  totalValue: number;
  markets: MarketGroup[];
}

function formatCents(value: number): string {
  return `${Math.round(value * 100)}¢`;
}

function Badge({
  side,
  isSelected,
  price,
  priceDirection,
}: {
  side: "yes" | "no";
  isSelected: boolean;
  price?: number;
  priceDirection?: PriceDirection;
}) {
  const isYes = side === "yes";

  return (
    <div
      className={cn(
        "flex flex-col items-center px-3 py-1.5 rounded-md text-xs font-medium transition-all",
        isSelected
          ? isYes
            ? "bg-blue-500 text-white"
            : "bg-orange-500 text-white"
          : "bg-muted/50 text-muted-foreground opacity-60",
        // Price direction flash effect
        priceDirection === "up" && "ring-2 ring-green-400",
        priceDirection === "down" && "ring-2 ring-red-400",
      )}
    >
      <span className="uppercase">{side}</span>
      {price !== undefined && (
        <span
          className={cn(
            "text-[10px] mt-0.5 transition-colors",
            isSelected ? "text-white/80" : "text-muted-foreground",
            priceDirection === "up" && "text-green-400",
            priceDirection === "down" && "text-red-400",
          )}
        >
          {formatCents(price)}
        </span>
      )}
    </div>
  );
}

function ModelRow({ modelGroup }: { modelGroup: ModelGroup }) {
  const logoPath = getLogoPathFromSeries(modelGroup.modelSeries);
  const initial = modelGroup.modelName.charAt(0).toUpperCase();

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <Avatar
          className="size-5 ring-[1.5px] ring-offset-0 bg-background shrink-0"
          style={{ ["--tw-ring-color" as string]: modelGroup.modelColor }}
        >
          {logoPath ? (
            <AvatarImage
              src={logoPath}
              alt={`${modelGroup.modelName} logo`}
              className="p-0.5"
            />
          ) : null}
          <AvatarFallback
            className="text-[10px] font-semibold text-foreground"
            style={{ backgroundColor: `${modelGroup.modelColor}20` }}
          >
            {initial}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium text-sm">{modelGroup.modelName}</span>
        <AnimateNumber
          prefix="$"
          format={{ maximumFractionDigits: 0, minimumFractionDigits: 0 }}
          className="font-mono text-muted-foreground"
        >
          {modelGroup.totalValue}
        </AnimateNumber>
      </div>

      <div className="space-y-4">
        {modelGroup.markets.map((market) => (
          <div key={market.marketTicker} className="pl-0">
            <p className="text-sm font-medium font-mono line-clamp-1 mb-2">
              {market.marketTitle || market.marketTicker}
            </p>

            <div className="flex items-start gap-2">
              <div className="flex gap-2">
                <Badge
                  side="yes"
                  isSelected={market.yesPosition?.side === "yes"}
                  price={market.yesPosition?.livePrice}
                  priceDirection={market.yesPosition?.priceDirection}
                />
                <Badge
                  side="no"
                  isSelected={market.noPosition?.side === "no"}
                  price={market.noPosition?.livePrice}
                  priceDirection={market.noPosition?.priceDirection}
                />
              </div>

              <div className="flex-1" />

              <div className="flex flex-col items-end gap-1 text-xs">
                {market.yesPosition && (
                  <div className="text-muted-foreground">
                    Qty: {market.yesPosition.quantity.toLocaleString()}
                  </div>
                )}
                {market.noPosition && (
                  <div className="text-muted-foreground">
                    Qty: {market.noPosition.quantity.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PositionsTable({
  positions,
  selectedModelId,
}: PositionsTableProps) {
  // Subscribe to live price updates for all positions
  const { prices, priceDirection, isConnected } = usePositionPrices(positions);

  const modelGroups = useMemo(() => {
    // Enrich positions with live prices
    const positionsWithPrice: PositionWithPrice[] = positions.map((p) => {
      const priceUpdate = prices.get(p.marketTicker);
      const livePrice = priceUpdate
        ? p.side === "yes"
          ? priceUpdate.yesPrice
          : priceUpdate.noPrice
        : undefined;

      return {
        ...p,
        livePrice,
        priceDirection: priceDirection.get(p.marketTicker),
      };
    });

    const groupedByModel = new Map<string, ModelGroup>();

    for (const position of positionsWithPrice) {
      if (selectedModelId && position.modelId !== selectedModelId) continue;

      const modelKey = position.modelId || "unknown";

      if (!groupedByModel.has(modelKey)) {
        groupedByModel.set(modelKey, {
          modelId: modelKey,
          modelName: position.modelName || "Unknown",
          modelColor: position.modelColor || DEFAULT_CHART_COLOR,
          modelSeries: position.modelSeries,
          totalValue: 0,
          markets: [],
        });
      }

      const modelGroup = groupedByModel.get(modelKey)!;
      // Use live price if available, otherwise estimate with 0.5
      const priceForValue = position.livePrice ?? 0.5;
      modelGroup.totalValue += position.quantity * priceForValue;
    }

    for (const position of positionsWithPrice) {
      if (selectedModelId && position.modelId !== selectedModelId) continue;

      const modelKey = position.modelId || "unknown";
      const modelGroup = groupedByModel.get(modelKey)!;
      const marketKey = position.marketTicker;

      let market = modelGroup.markets.find((m) => m.marketTicker === marketKey);

      if (!market) {
        market = {
          marketTicker: position.marketTicker,
          marketTitle: position.marketTitle,
          positions: [],
          yesPosition: undefined,
          noPosition: undefined,
        };
        modelGroup.markets.push(market);
      }

      market.positions.push(position);
      if (position.side === "yes") {
        market.yesPosition = position;
      } else {
        market.noPosition = position;
      }
    }

    return Array.from(groupedByModel.values());
  }, [positions, selectedModelId, prices, priceDirection]);

  // Check if any connection is active
  const hasConnection = isConnected.kalshi || isConnected.polymarket;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-end">
        {positions.length > 0 && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs",
              hasConnection ? "text-green-500" : "text-muted-foreground"
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
          {modelGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No open positions</p>
              <p className="text-sm text-muted-foreground/70">
                Positions will appear here when models open trades
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {modelGroups.map((modelGroup) => (
                <ModelRow key={modelGroup.modelId} modelGroup={modelGroup} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
