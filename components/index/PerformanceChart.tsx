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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ChartDataPoint, LeaderboardEntry } from "@/types/arena";
import {
  DEFAULT_ARENA_MODELS,
  DEFAULT_STARTING_CAPITAL,
  CHART_CONFIG,
} from "@/lib/arena/constants";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PerformanceChartProps {
  data: ChartDataPoint[];
  title?: string;
  latestValues?: Map<string, number>;
  leaderboard?: LeaderboardEntry[];
}

type TimeRange = "24H" | "72H" | "ALL";
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

// Custom tooltip component
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
          .map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">
                {valueDisplay === "dollar"
                  ? formatCurrency(entry.value)
                  : formatPercent(entry.value, DEFAULT_STARTING_CAPITAL)}
              </span>
            </div>
          ))}
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

// Custom legend component
interface CustomLegendProps {
  payload?: Array<{ value: string; color: string; dataKey: string }>;
  latestValues?: Map<string, number>;
  leaderboard?: LeaderboardEntry[];
  hoveredModel: string | null;
  onModelHover: (modelName: string | null) => void;
}

function CustomLegend({
  payload,
  latestValues,
  leaderboard,
  hoveredModel,
  onModelHover,
}: CustomLegendProps) {
  if (!payload || payload.length === 0) return null;

  // Build model data with rankings
  const modelsWithData = payload.map((entry, index) => {
    const value = latestValues?.get(entry.value) || DEFAULT_STARTING_CAPITAL;
    const leaderboardEntry = leaderboard?.find(
      (e) => e.model.name === entry.value,
    );
    return {
      name: entry.value,
      color: entry.color,
      value,
      rank: leaderboardEntry?.rank || index + 1,
      change: leaderboardEntry?.change || 0,
    };
  });

  // Sort by rank
  const sortedModels = [...modelsWithData].sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-2">
      {sortedModels.map((model) => {
        const isPositive = model.value >= DEFAULT_STARTING_CAPITAL;
        const isHovered = hoveredModel === model.name;
        const isDimmed = hoveredModel !== null && !isHovered;
        const changePercent =
          ((model.value - DEFAULT_STARTING_CAPITAL) /
            DEFAULT_STARTING_CAPITAL) *
          100;

        return (
          <div
            key={model.name}
            className={cn(
              "flex items-center gap-1 px-1 rounded transition-opacity cursor-default text-xs",
              "hover:bg-muted/50",
              isDimmed && "opacity-30",
            )}
            onMouseEnter={() => onModelHover(model.name)}
            onMouseLeave={() => onModelHover(null)}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: model.color }}
            />
            <span className="font-medium">{model.name}</span>
            <span
              className={cn(
                "font-medium",
                isPositive ? "text-green-500" : "text-red-500",
              )}
            >
              {changePercent >= 0 ? "+" : ""}
              {changePercent.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PerformanceChart({
  data,
  title = "Account Value Over Time",
  latestValues,
  leaderboard,
}: PerformanceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL");
  const [valueDisplay, setValueDisplay] = useState<ValueDisplay>("dollar");
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);

  // Get model names from data keys (excluding timestamp)
  const modelNames = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter((key) => key !== "timestamp");
  }, [data]);

  // Create color map from model identifier to chart color
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    DEFAULT_ARENA_MODELS.forEach((model) => {
      map.set(model.name, model.chartColor);
    });
    return map;
  }, []);

  // Filter data based on time range
  const filteredData = useMemo(() => {
    if (timeRange === "ALL" || data.length === 0) return data;

    const now = new Date();
    const hoursBack = timeRange === "24H" ? 24 : 72;
    const cutoff = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    return data.filter((point) => new Date(point.timestamp) >= cutoff);
  }, [data, timeRange]);

  // Convert values to percentages if needed
  const chartData = useMemo(() => {
    if (valueDisplay === "dollar") return filteredData;

    return filteredData.map((point) => {
      const converted: ChartDataPoint = { timestamp: point.timestamp };
      modelNames.forEach((name) => {
        const value = point[name] as number;
        converted[name] =
          ((value - DEFAULT_STARTING_CAPITAL) / DEFAULT_STARTING_CAPITAL) * 100;
      });
      return converted;
    });
  }, [filteredData, valueDisplay, modelNames]);

  // Calculate Y-axis domain
  const yDomain = useMemo(() => {
    if (valueDisplay === "percent") {
      let min = 0;
      let max = 0;
      chartData.forEach((point) => {
        Object.entries(point).forEach(([key, value]) => {
          if (key !== "timestamp" && typeof value === "number") {
            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        });
      });
      const padding = Math.max((max - min) * 0.1, 2);
      return [Math.floor(min - padding), Math.ceil(max + padding)];
    }

    let min = DEFAULT_STARTING_CAPITAL;
    let max = DEFAULT_STARTING_CAPITAL;
    chartData.forEach((point) => {
      Object.entries(point).forEach(([key, value]) => {
        if (key !== "timestamp" && typeof value === "number") {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });
    const padding = (max - min) * 0.05;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData, valueDisplay]);

  return (
    <Card className="flex-1">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {/* Time Range Toggle */}
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(val) => val && setTimeRange(val as TimeRange)}
              size="sm"
            >
              <ToggleGroupItem value="24H" className="text-xs px-2">
                24H
              </ToggleGroupItem>
              <ToggleGroupItem value="72H" className="text-xs px-2">
                72H
              </ToggleGroupItem>
              <ToggleGroupItem value="ALL" className="text-xs px-2">
                ALL
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Value Display Toggle */}
            <ToggleGroup
              type="single"
              value={valueDisplay}
              onValueChange={(val) =>
                val && setValueDisplay(val as ValueDisplay)
              }
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
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: CHART_CONFIG.height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ ...CHART_CONFIG.margin, right: 70 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={{ stroke: "hsl(var(--muted))" }}
                axisLine={{ stroke: "hsl(var(--muted))" }}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(value) =>
                  valueDisplay === "dollar"
                    ? `$${(value / 1000).toFixed(1)}k`
                    : `${value.toFixed(0)}%`
                }
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={{ stroke: "hsl(var(--muted))" }}
                axisLine={{ stroke: "hsl(var(--muted))" }}
                width={60}
              />
              <Tooltip
                content={<CustomTooltip valueDisplay={valueDisplay} />}
              />
              <ReferenceLine
                y={valueDisplay === "dollar" ? DEFAULT_STARTING_CAPITAL : 0}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeOpacity={0.5}
              />
              {modelNames.map((name) => {
                const color = colorMap.get(name) || "#6366f1";
                const isHovered = hoveredModel === name;
                const isDimmed = hoveredModel !== null && !isHovered;
                return (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={color}
                    strokeWidth={isHovered ? 3 : 2}
                    strokeOpacity={isDimmed ? 0.2 : 1}
                    dot={false}
                    activeDot={{ r: 4 }}
                    animationDuration={CHART_CONFIG.animationDuration}
                  />
                );
              })}
              <Legend
                content={
                  <CustomLegend
                    latestValues={latestValues}
                    leaderboard={leaderboard}
                    hoveredModel={hoveredModel}
                    onModelHover={setHoveredModel}
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
