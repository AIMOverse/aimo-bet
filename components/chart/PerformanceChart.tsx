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
import { getModelSeriesIcon } from "@/lib/ai/models/catalog";
import { DEFAULT_STARTING_CAPITAL, CHART_CONFIG } from "@/lib/config";
import { useMemo, useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AnimateNumber, Ticker } from "motion-plus/react";
import { useTheme } from "next-themes";

interface PerformanceChartProps {
  data: ChartDataPoint[];
  title?: string;
  latestValues?: Map<string, number>;
  pnlValues?: Map<string, number>;
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
  pnl: number;
  totalTokens: number;
  valueDisplay: ValueDisplay;
  isMobile?: boolean;
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
  pnl,
  totalTokens,
  valueDisplay,
  isMobile = false,
}: LineEndLabelProps) {
  // Stagger delay based on model name for ambient glow effect
  // Must be before early return to satisfy React hooks rules
  const staggerDelay = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < modelName.length; i++) {
      hash = (hash << 5) - hash + modelName.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 5) * 0.6; // 0-3 second stagger
  }, [modelName]);

  // Only render at the last data point
  const xNum = typeof x === "string" ? parseFloat(x) : x;
  const yNum = typeof y === "string" ? parseFloat(y) : y;

  if (index !== dataLength - 1 || xNum === undefined || yNum === undefined) {
    return null;
  }

  const icon = getModelSeriesIcon(modelName);
  const initial = modelName.charAt(0).toUpperCase();
  const logoSize = isMobile ? 16 : 20; // Smaller on mobile
  const labelWidth = isMobile ? 24 : 180; // Just avatar width on mobile

  // Calculate percent change from P&L
  const percentChange = (pnl / DEFAULT_STARTING_CAPITAL) * 100;
  const isPositive = pnl >= 0;

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
        <div className="relative shrink-0">
          {/* Subtle ambient glow ring - hidden for dead models */}
          {!isDead && (
            <div
              className="absolute inset-0 rounded-full animate-glow-pulse"
              style={{
                background: `radial-gradient(circle, ${color}25 0%, transparent 70%)`,
                animationDelay: `${staggerDelay}s`,
              }}
            />
          )}
          <Avatar
            className={cn(
              "ring-[1.5px] ring-offset-0 bg-background",
              isMobile ? "size-4" : "size-5",
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
        </div>
        {/* P&L value - hidden on mobile */}
        {!isMobile && (
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
        )}
      </div>
    </foreignObject>
  );
}

// Custom legend component
interface CustomLegendProps {
  payload?: Array<{ value: string; color: string; dataKey: string }>;
  latestValues?: Map<string, number>;
  pnlValues?: Map<string, number>;
  tokenUsage?: Map<string, number>;
  leaderboard?: LeaderboardEntry[];
  hoveredModel: string | null;
  onModelHover: (modelName: string | null) => void;
  deadModels?: Set<string>;
  isMobile?: boolean;
}

// Single legend item component (used by both mobile ticker and desktop legend)
function LegendItem({
  model,
  hoveredModel,
  onModelHover,
  deadModels,
  compact = false,
}: {
  model: {
    name: string;
    color: string;
    value: number;
    pnl: number;
  };
  hoveredModel: string | null;
  onModelHover: (modelName: string | null) => void;
  deadModels?: Set<string>;
  compact?: boolean;
}) {
  const isHovered = hoveredModel === model.name;
  const isDimmed = hoveredModel !== null && !isHovered;
  const isDead = deadModels?.has(model.name) ?? false;
  const capitalBurnedPercent =
    ((DEFAULT_STARTING_CAPITAL - model.value) / DEFAULT_STARTING_CAPITAL) * 100;
  const isBurning = capitalBurnedPercent > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 rounded transition-opacity cursor-default text-xs shrink-0",
        "hover:bg-muted/50",
        isDimmed && "opacity-30",
        isDead && "opacity-60",
        compact && "py-1",
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
        className={cn(
          "font-medium shrink-0",
          isDead && "text-muted-foreground",
        )}
      >
        {model.name}
      </span>
      <span className="text-muted-foreground shrink-0">
        {formatCurrency(model.value)}
      </span>
      <span
        className={cn(
          "font-medium shrink-0",
          isDead
            ? "text-muted-foreground"
            : isBurning
              ? "text-red-500"
              : "text-green-500",
        )}
      >
        ({isBurning ? "" : "-"}
        {Math.abs(capitalBurnedPercent).toFixed(1)}%)
      </span>
      <CapitalBurnedProgress currentValue={model.value} />
    </div>
  );
}

function CustomLegend({
  payload,
  latestValues,
  pnlValues,
  tokenUsage,
  leaderboard,
  hoveredModel,
  onModelHover,
  deadModels,
  isMobile = false,
}: CustomLegendProps) {
  if (!payload || payload.length === 0) return null;

  // Build model data with rankings and token usage
  const modelsWithData = payload.map((entry, index) => {
    const value = latestValues?.get(entry.value) || DEFAULT_STARTING_CAPITAL;
    const pnl = pnlValues?.get(entry.value) ?? value - DEFAULT_STARTING_CAPITAL;
    const tokens = tokenUsage?.get(entry.value) || 0;
    const leaderboardEntry = leaderboard?.find(
      (e) => e.model.name === entry.value,
    );
    return {
      name: entry.value,
      color: entry.color,
      value,
      pnl,
      tokens,
      rank: leaderboardEntry?.rank || index + 1,
      change: leaderboardEntry?.change || 0,
    };
  });

  // Sort by rank
  const sortedModels = [...modelsWithData].sort((a, b) => a.rank - b.rank);

  // Mobile: horizontal scrolling ticker
  if (isMobile) {
    const tickerItems = sortedModels.map((model) => (
      <LegendItem
        key={model.name}
        model={model}
        hoveredModel={hoveredModel}
        onModelHover={onModelHover}
        deadModels={deadModels}
        compact
      />
    ));

    return (
      <div className="pt-2 -mx-4">
        <Ticker items={tickerItems} hoverFactor={0} />
      </div>
    );
  }

  // Desktop: wrapped flex layout
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
      {sortedModels.map((model) => (
        <LegendItem
          key={model.name}
          model={model}
          hoveredModel={hoveredModel}
          onModelHover={onModelHover}
          deadModels={deadModels}
        />
      ))}
    </div>
  );
}

/**
 * Calculate data-driven axis bounds that:
 * 1. Always include zero (for P&L context)
 * 2. Use nice intervals based on actual data range
 * 3. Add minimal padding for breathing room
 */
function getDataDrivenAxisBounds(
  dataMin: number,
  dataMax: number,
  isPercent: boolean,
): { min: number; max: number } {
  // Always include zero in the range
  const rangeMin = Math.min(dataMin, 0);
  const rangeMax = Math.max(dataMax, 0);
  const range = rangeMax - rangeMin;

  // Handle empty/minimal data
  if (range < (isPercent ? 1 : 10)) {
    const defaultPadding = isPercent ? 10 : 100;
    return {
      min: Math.min(rangeMin, -defaultPadding),
      max: Math.max(rangeMax, defaultPadding),
    };
  }

  // Calculate nice interval targeting ~5-7 tick marks
  const rawInterval = range / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const normalized = rawInterval / magnitude;

  // Round to nearest nice multiplier
  let niceMultiplier: number;
  if (normalized <= 1) niceMultiplier = 1;
  else if (normalized <= 2) niceMultiplier = 2;
  else if (normalized <= 2.5) niceMultiplier = 2.5;
  else if (normalized <= 5) niceMultiplier = 5;
  else niceMultiplier = 10;

  const interval = niceMultiplier * magnitude;

  // Extend to nice boundaries
  const niceMin = Math.floor(rangeMin / interval) * interval;
  const niceMax = Math.ceil(rangeMax / interval) * interval;

  // Add half-interval padding
  const padding = interval * 0.5;

  return {
    min: niceMin - padding,
    max: niceMax + padding,
  };
}

// CapitalBurnedProgress component for displaying capital burned as a progress bar
interface CapitalBurnedProgressProps {
  currentValue: number;
  startingCapital?: number;
}

function CapitalBurnedProgress({
  currentValue,
  startingCapital = DEFAULT_STARTING_CAPITAL,
}: CapitalBurnedProgressProps) {
  // Calculate capital burned percentage (0% = no loss, 100% = all capital gone)
  const burnedPercent = Math.max(
    0,
    Math.min(100, ((startingCapital - currentValue) / startingCapital) * 100),
  );
  const remainingPercent = 100 - burnedPercent;

  // Color based on remaining capital
  const getColor = () => {
    if (remainingPercent > 50) return "bg-green-500";
    if (remainingPercent > 25) return "bg-yellow-500";
    if (remainingPercent > 0) return "bg-red-500";
    return "bg-muted-foreground"; // Depleted
  };

  // For legend: wider bar showing remaining capital
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", getColor())}
          style={{ width: `${remainingPercent}%` }}
        />
      </div>
    </div>
  );
}

export function PerformanceChart({
  data,
  title = "P&L Over Time",
  latestValues,
  pnlValues,
  tokenUsage,
  leaderboard,
  deadModels,
}: PerformanceChartProps) {
  const [valueDisplay, setValueDisplay] = useState<ValueDisplay>("dollar");
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  // Responsive right margin for line-end labels (smaller on mobile)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  // Calculate Y-axis domain: data-driven bounds that always include zero
  const yDomain = useMemo((): [number, number] => {
    const excludeKeys = new Set(["timestamp", "_ts"]);

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

    // Handle empty data
    if (!isFinite(actualMax) || !isFinite(actualMin)) {
      const defaultMax = isPercent ? 10 : 100;
      return [-defaultMax, defaultMax];
    }

    const bounds = getDataDrivenAxisBounds(actualMin, actualMax, isPercent);
    return [bounds.min, bounds.max];
  }, [chartData, valueDisplay]);

  // Calculate X-axis domain: smart buffer based on data span
  const xDomain = useMemo((): [number, number] => {
    // Constants
    const MIN_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
    const MAX_BUFFER_MS = 30 * 60 * 1000; // 30 minutes
    const MIN_SPAN_MS = 30 * 60 * 1000; // 30 minutes minimum width

    if (chartData.length === 0) {
      // Fallback: show 30-minute window from now
      return [now, now + MIN_SPAN_MS];
    }

    const firstTs = chartData[0]._ts as number;
    const lastTs = chartData[chartData.length - 1]._ts as number;
    const dataSpan = lastTs - firstTs;

    // Dynamic buffer: 10% of span, clamped
    const buffer = Math.max(
      MIN_BUFFER_MS,
      Math.min(MAX_BUFFER_MS, dataSpan * 0.1),
    );

    // Calculate end time
    let endTs = lastTs + buffer;

    // Enforce minimum span
    const totalSpan = endTs - firstTs;
    if (totalSpan < MIN_SPAN_MS) {
      endTs = firstTs + MIN_SPAN_MS;
    }

    return [firstTs, endTs];
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
        {/* Responsive height: ~300px on mobile, 500px on desktop */}
        <div className="h-[300px] lg:h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ ...CHART_CONFIG.margin, right: isMobile ? 30 : 110 }}
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
                    {/* Line-end labels: avatar only on mobile, avatar + P&L on desktop */}
                    <LabelList
                      dataKey={name}
                      content={(props) => {
                        // Get P&L from the last chart data point to match the line's visual position
                        const lastChartPoint = chartData[chartData.length - 1];
                        const chartPnl = lastChartPoint
                          ? ((lastChartPoint[name] as number) ?? 0)
                          : 0;
                        // In percent mode, chartData already has percent values; in dollar mode, it has dollar P&L
                        // We need dollar P&L for the label, so convert back if in percent mode
                        const pnlDollars =
                          valueDisplay === "percent"
                            ? (chartPnl / 100) * DEFAULT_STARTING_CAPITAL
                            : chartPnl;

                        return (
                          <LineEndLabel
                            {...props}
                            dataLength={chartData.length}
                            modelName={name}
                            color={lineColor}
                            isHovered={isHovered}
                            isDimmed={isDimmed}
                            isDead={isDead}
                            onHover={setHoveredModel}
                            pnl={pnlDollars}
                            totalTokens={tokenUsage?.get(name) ?? 0}
                            valueDisplay={valueDisplay}
                            isMobile={isMobile}
                          />
                        );
                      }}
                    />
                  </Line>
                );
              })}
              <Legend
                content={
                  <CustomLegend
                    latestValues={latestValues}
                    pnlValues={pnlValues}
                    tokenUsage={tokenUsage}
                    leaderboard={leaderboard}
                    hoveredModel={hoveredModel}
                    onModelHover={setHoveredModel}
                    deadModels={deadModels}
                    isMobile={isMobile}
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
