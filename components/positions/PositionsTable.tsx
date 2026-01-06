"use client";

import { useMemo } from "react";
import { Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { AgentPosition } from "@/hooks/positions/usePositions";
import { cn } from "@/lib/utils";

const DEFAULT_CHART_COLOR = "#6366f1";

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

interface PositionsTableProps {
  positions: AgentPosition[];
  selectedModelId?: string | null;
}

function PositionRow({ position }: { position: AgentPosition }) {
  const isYes = position.side === "yes";
  const modelName = position.modelName ?? "Model";
  const logoPath = getLogoPathFromSeries(position.modelSeries);
  const chartColor = position.modelColor ?? DEFAULT_CHART_COLOR;
  const initial = modelName.charAt(0).toUpperCase();

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      {/* Model avatar and name */}
      {position.modelName && (
        <div className="flex items-center gap-2 mb-2">
          <Avatar
            className="size-5 ring-[1.5px] ring-offset-0 bg-background shrink-0"
            style={{ ["--tw-ring-color" as string]: chartColor }}
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
      )}

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
          {position.side.toUpperCase()}
        </span>
      </div>

      {/* Position details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Quantity</span>
          <p className="font-medium">{position.quantity.toLocaleString()}</p>
        </div>
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
                  key={`${position.marketTicker}-${position.side}-${index}`}
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
