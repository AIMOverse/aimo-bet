"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ChartDataPoint, LeaderboardEntry } from "@/lib/supabase/types";
import { MODELS } from "@/lib/ai/models";
import {
  getModelSeriesIcon,
  getModelCostPerMillion,
  type ModelSeriesIconResult,
} from "@/lib/ai/models/catalog";
import { DEFAULT_STARTING_CAPITAL, CHART_CONFIG } from "@/lib/config";
import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AnimateNumber } from "motion-plus/react";
import { useTheme } from "next-themes";

interface PerformanceChartProps {
  data: ChartDataPoint[];
  title?: string;
  latestValues?: Map<string, number>;
  tokenUsage?: Map<string, number>;
  leaderboard?: LeaderboardEntry[];
  deadModels?: Set<string>;
}

// Color for dead/muted models
const DEAD_MODEL_COLOR = "hsl(var(--muted-foreground))";

type ValueDisplay = "dollar" | "percent";

// Format timestamp for display
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format currency for tooltip
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format percentage
function formatPercent(value: number, startingCapital: number): string {
  const pct = ((value - startingCapital) / startingCapital) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

// Format P&L value
function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}${formatCurrency(pnl)}`;
}

// Format token count (e.g., 1234567 -> "1.2M")
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return tokens.toString();
}

// Custom tooltip component - shows P&L values
function CustomTooltip({
  active,
  payload,
  label,
  valueDisplay,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  valueDisplay: ValueDisplay;
}) {
  if (!active || !payload || !label) return null;

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-2">{formatTime(label)}</p>
      <div className="space-y-1">
        {payload
          .sort((a, b) => b.value - a.value)
          .map((entry) => {
            // entry.value is already P&L (transformed in chartData)
            const pnl = entry.value;
            const isPositive = pnl >= 0;
            return (
              <div key={entry.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground">{entry.name}:</span>
                <span
                  className={cn(
                    "font-medium",
                    isPositive ? "text-green-500" : "text-red-500",
                  )}
                >
                  {valueDisplay === "dollar"
                    ? formatPnL(pnl)
                    : `${isPositive ? "+" : ""}${pnl.toFixed(1)}%`}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
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

// Custom label component for line-end logos with P&L and token info
interface LineEndLabelProps {
  x?: number | string;
  y?: number | string;
  index?: number;
  dataLength: number;
  modelName: string;
  color: string;
  isHovered: boolean;
  isDimmed: boolean;
  isDead: boolean;
  onHover: (name: string | null) => void;
  latestValue: number;
  totalTokens: number;
  valueDisplay: ValueDisplay;
}

function LineEndLabel({
  x,
  y,
  index,
  dataLength,
  modelName,
  color,
  isHovered,
  isDimmed,
  isDead,
  onHover,
  latestValue,
  totalTokens,
  valueDisplay,
}: LineEndLabelProps) {
  // Only render at the last data point
  const xNum = typeof x === "string" ? parseFloat(x) : x;
  const yNum = typeof y === "string" ? parseFloat(y) : y;

  if (index !== dataLength - 1 || xNum === undefined || yNum === undefined) {
    return null;
  }

  const icon = getModelSeriesIcon(modelName);
  const initial = modelName.charAt(0).toUpperCase();
  const logoSize = 20; // Single row height
  const labelWidth = 180; // Width for logo + P&L + token info horizontally

  // Calculate P&L values
  const pnl = latestValue - DEFAULT_STARTING_CAPITAL;
  const percentChange = (pnl / DEFAULT_STARTING_CAPITAL) * 100;
  const isPositive = pnl >= 0;

  // Get cost per million tokens for this model
  const costPerMillion = getModelCostPerMillion(modelName);

  return (
    <foreignObject
      x={xNum + 4}
      y={yNum - logoSize / 2}
      width={labelWidth}
      height={logoSize}
      style={{
        overflow: "visible",
        opacity: isDimmed ? 0.3 : 1,
        transition: "opacity 150ms",
      }}
    >
      <div
        className="flex items-center gap-1.5 cursor-pointer"
        onMouseEnter={() => onHover(modelName)}
        onMouseLeave={() => onHover(null)}
      >
        <Avatar
          className={cn(
            "size-5 ring-[1.5px] ring-offset-0 bg-background shrink-0",
            isHovered && "ring-2",
            isDead && "grayscale opacity-60",
          )}
          style={{
            ["--tw-ring-color" as string]: isDead ? DEAD_MODEL_COLOR : color,
          }}
        >
          {icon?.type === "component" ? (
            <icon.Component className="size-full p-0.5" />
          ) : icon?.type === "image" ? (
            <>
              <AvatarImage
                src={icon.src}
                alt={`${modelName} logo`}
                className="p-0.5"
              />
              <AvatarFallback
                className="text-[10px] font-semibold text-foreground bg-muted"
                style={{ backgroundColor: `${color}20` }}
              >
                {initial}
              </AvatarFallback>
            </>
          ) : (
            <AvatarFallback
              className="text-[10px] font-semibold text-foreground bg-muted"
              style={{ backgroundColor: `${color}20` }}
            >
              {initial}
            </AvatarFallback>
          )}
        </Avatar>
        {/* P&L value */}
        <span
          className={cn(
            "text-[11px] font-semibold whitespace-nowrap tabular-nums",
            isDead && "text-muted-foreground",
            !isDead && (isPositive ? "text-green-500" : "text-red-500"),
          )}
        >
          {valueDisplay === "dollar" ? (
            <>
              {isPositive ? "+" : "-"}
              <AnimateNumber
                format={{
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }}
                locales="en-US"
                transition={{
                  layout: { duration: 0.3 },
                  y: { type: "spring", visualDuration: 0.4, bounce: 0.2 },
                }}
              >
                {Math.abs(pnl)}
              </AnimateNumber>
            </>
          ) : (
            <>
              {isPositive ? "+" : ""}
              <AnimateNumber
                format={{
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }}
                suffix="%"
                transition={{
                  layout: { duration: 0.3 },
                  y: { type: "spring", visualDuration: 0.4, bounce: 0.2 },
                }}
              >
                {percentChange}
              </AnimateNumber>
            </>
          )}
        </span>
        {/* Token usage info */}
        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
          {formatTokens(totalTokens)} / ${costPerMillion.toFixed(2)}
        </span>
      </div>
    </foreignObject>
  );
}

// Custom legend component
interface CustomLegendProps {
  payload?: Array<{ value: string; color: string; dataKey: string }>;
  latestValues?: Map<string, number>;
  tokenUsage?: Map<string, number>;
  leaderboard?: LeaderboardEntry[];
  hoveredModel: string | null;
  onModelHover: (modelName: string | null) => void;
  deadModels?: Set<string>;
}

function CustomLegend({
  payload,
  latestValues,
  tokenUsage,
  leaderboard,
  hoveredModel,
  onModelHover,
  deadModels,
}: CustomLegendProps) {
  if (!payload || payload.length === 0) return null;

  // Build model data with rankings and token usage
  const modelsWithData = payload.map((entry, index) => {
    const value = latestValues?.get(entry.value) || DEFAULT_STARTING_CAPITAL;
    const tokens = tokenUsage?.get(entry.value) || 0;
    const leaderboardEntry = leaderboard?.find(
      (e) => e.model.name === entry.value,
    );
    return {
      name: entry.value,
      color: entry.color,
      value,
      tokens,
      rank: leaderboardEntry?.rank || index + 1,
      change: leaderboardEntry?.change || 0,
    };
  });

  // Sort by rank
  const sortedModels = [...modelsWithData].sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
      {sortedModels.map((model) => {
        const pnl = model.value - DEFAULT_STARTING_CAPITAL;
        const isPositive = pnl >= 0;
        const isHovered = hoveredModel === model.name;
        const isDimmed = hoveredModel !== null && !isHovered;
        const isDead = deadModels?.has(model.name) ?? false;
        const changePercent = (pnl / DEFAULT_STARTING_CAPITAL) * 100;
        const costPerMillion = getModelCostPerMillion(model.name);

        return (
          <div
            key={model.name}
            className={cn(
              "flex items-center gap-1 px-1 rounded transition-opacity cursor-default text-xs",
              "hover:bg-muted/50",
              isDimmed && "opacity-30",
              isDead && "opacity-60",
            )}
            onMouseEnter={() => onModelHover(model.name)}
            onMouseLeave={() => onModelHover(null)}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: isDead ? DEAD_MODEL_COLOR : model.color,
              }}
            />
            <span
              className={cn("font-medium", isDead && "text-muted-foreground")}
            >
              {model.name}
            </span>
            <span
              className={cn(
                "font-medium",
                isDead
                  ? "text-muted-foreground"
                  : isPositive
                    ? "text-green-500"
                    : "text-red-500",
              )}
            >
              {changePercent >= 0 ? "+" : ""}
              {changePercent.toFixed(1)}%
            </span>
            <span className="text-muted-foreground text-[10px]">
              ({formatTokens(model.tokens)} / ${costPerMillion.toFixed(2)})
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Nice number rounding for Y-axis ticks (symmetric around 0)
function getNiceAxisMax(value: number, isPercent: boolean): number {
  if (value <= 0) {
    return isPercent ? 10 : 100; // Minimum range
  }

  // Define nice tick values for dollar and percent modes
  const niceValues = isPercent
    ? [5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500]
    : [
        50, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000, 2500, 5000, 7500,
        10000,
      ];

  // Find the smallest nice value that fits the data with padding
  for (const nice of niceValues) {
    if (nice >= value) {
      return nice;
    }
  }

  // For very large values, round up to nearest significant figure
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / magnitude) * magnitude;
}

export function PerformanceChart({
  data,
  title = "P&L Over Time",
  latestValues,
  tokenUsage,
  leaderboard,
  deadModels,
}: PerformanceChartProps) {
  const [valueDisplay, setValueDisplay] = useState<ValueDisplay>("dollar");
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  // Theme-aware colors for chart elements
  const axisColor = useMemo(() => {
    return resolvedTheme === "dark" ? "#a1a1aa" : "#71717a";
  }, [resolvedTheme]);

  const gridColor = useMemo(() => {
    return resolvedTheme === "dark" ? "#3f3f46" : "#e4e4e7";
  }, [resolvedTheme]);

  // Real-time current time for X-axis (updates every minute)
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60 * 1000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Get model names from data keys (excluding timestamp)
  const modelNames = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter((key) => key !== "timestamp");
  }, [data]);

  // Create color map from model identifier to chart color
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    MODELS.forEach((model) => {
      if (model.chartColor) {
        map.set(model.name, model.chartColor);
      }
    });
    return map;
  }, []);

  // Convert values to P&L (profit/loss from starting capital)
  // Append latest real-time values as the newest data point
  const chartData = useMemo(() => {
    const historicalData = data.map((point) => {
      const converted: ChartDataPoint & { _ts: number } = {
        timestamp: point.timestamp,
        _ts: new Date(point.timestamp).getTime(),
      };
      modelNames.forEach((name) => {
        const value = point[name] as number;
        const pnl = value - DEFAULT_STARTING_CAPITAL;
        // In dollar mode: show P&L in dollars
        // In percent mode: show P&L as percentage of starting capital
        converted[name] =
          valueDisplay === "percent"
            ? (pnl / DEFAULT_STARTING_CAPITAL) * 100
            : pnl;
      });
      return converted;
    });

    // TEMPORARILY COMMENTED OUT to debug -$1000 outlier issue
    // Add latest real-time values as the newest point
    // if (latestValues && latestValues.size > 0) {
    //   const latestPoint: ChartDataPoint & { _ts: number } = {
    //     timestamp: new Date(now).toISOString(),
    //     _ts: now,
    //   };
    //   modelNames.forEach((name) => {
    //     const value = latestValues.get(name) ?? DEFAULT_STARTING_CAPITAL;
    //     const pnl = value - DEFAULT_STARTING_CAPITAL;
    //     latestPoint[name] =
    //       valueDisplay === "percent"
    //         ? (pnl / DEFAULT_STARTING_CAPITAL) * 100
    //         : pnl;
    //   });
    //   historicalData.push(latestPoint);
    // }

    return historicalData;
  }, [data, valueDisplay, modelNames, latestValues, now]);

  // Calculate Y-axis domain: centered around 0 for P&L display with nice tick values
  const yDomain = useMemo(() => {
    const excludeKeys = new Set(["timestamp", "_ts"]);

    // Find min and max P&L values from data
    let actualMin = Infinity;
    let actualMax = -Infinity;

    chartData.forEach((point) => {
      Object.entries(point).forEach(([key, value]) => {
        if (!excludeKeys.has(key) && typeof value === "number") {
          actualMin = Math.min(actualMin, value);
          actualMax = Math.max(actualMax, value);
        }
      });
    });

    const isPercent = valueDisplay === "percent";

    // Handle empty data case
    if (!isFinite(actualMax) || !isFinite(actualMin)) {
      const defaultMax = isPercent ? 10 : 100;
      return [-defaultMax, defaultMax];
    }

    // Get the maximum absolute value and add 20% padding
    const absMax = Math.max(Math.abs(actualMin), Math.abs(actualMax));
    const paddedMax = absMax * 1.2;

    // Round to a nice axis value for clean tick marks
    const niceMax = getNiceAxisMax(paddedMax, isPercent);

    return [-niceMax, niceMax];
  }, [chartData, valueDisplay]);

  // Calculate X-axis domain: first data point to now + 1 hour
  const xDomain = useMemo((): [number, number] => {
    const oneHourLater = now + 60 * 60 * 1000;

    // Start from first data point, or "now" if no data
    const firstTimestamp =
      chartData.length > 0 ? (chartData[0]._ts as number) : now;

    return [firstTimestamp, oneHourLater];
  }, [chartData, now]);

  return (
    <Card className="flex-1">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          {/* Value Display Toggle */}
          <ToggleGroup
            type="single"
            value={valueDisplay}
            onValueChange={(val) => val && setValueDisplay(val as ValueDisplay)}
            size="sm"
          >
            <ToggleGroupItem value="dollar" className="text-xs px-2">
              $
            </ToggleGroupItem>
            <ToggleGroupItem value="percent" className="text-xs px-2">
              %
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: CHART_CONFIG.height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ ...CHART_CONFIG.margin, right: 110 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="_ts"
                type="number"
                scale="time"
                domain={xDomain}
                tickFormatter={(ts: number) =>
                  formatTime(new Date(ts).toISOString())
                }
                className="text-xs"
                tick={{ fill: axisColor }}
                tickLine={{ stroke: gridColor }}
                axisLine={{ stroke: gridColor }}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(value) => {
                  const sign = value >= 0 ? "+" : "";
                  if (valueDisplay === "dollar") {
                    const absValue = Math.abs(value);
                    if (absValue >= 1000) {
                      return `${sign}$${(value / 1000).toFixed(1)}k`;
                    }
                    return `${sign}$${value.toFixed(0)}`;
                  }
                  return `${sign}${value.toFixed(0)}%`;
                }}
                className="text-xs"
                tick={{ fill: axisColor }}
                tickLine={{ stroke: gridColor }}
                axisLine={{ stroke: gridColor }}
                width={60}
                allowDataOverflow={false}
              />
              <Tooltip
                content={<CustomTooltip valueDisplay={valueDisplay} />}
              />
              {/* Zero line (break-even) */}
              <ReferenceLine
                y={0}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeOpacity={0.5}
              />
              {modelNames.map((name) => {
                const baseColor = colorMap.get(name) || "#6366f1";
                const isDead = deadModels?.has(name) ?? false;
                const lineColor = isDead ? DEAD_MODEL_COLOR : baseColor;
                const isHovered = hoveredModel === name;
                const isDimmed = hoveredModel !== null && !isHovered;
                return (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={lineColor}
                    strokeWidth={isHovered ? 3 : 2}
                    strokeOpacity={isDimmed ? 0.2 : isDead ? 0.6 : 1}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey={name}
                      content={(props) => (
                        <LineEndLabel
                          {...props}
                          dataLength={chartData.length}
                          modelName={name}
                          color={lineColor}
                          isHovered={isHovered}
                          isDimmed={isDimmed}
                          isDead={isDead}
                          onHover={setHoveredModel}
                          latestValue={
                            latestValues?.get(name) ?? DEFAULT_STARTING_CAPITAL
                          }
                          totalTokens={tokenUsage?.get(name) ?? 0}
                          valueDisplay={valueDisplay}
                        />
                      )}
                    />
                  </Line>
                );
              })}
              <Legend
                content={
                  <CustomLegend
                    latestValues={latestValues}
                    tokenUsage={tokenUsage}
                    leaderboard={leaderboard}
                    hoveredModel={hoveredModel}
                    onModelHover={setHoveredModel}
                    deadModels={deadModels}
                  />
                }
                verticalAlign="bottom"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
