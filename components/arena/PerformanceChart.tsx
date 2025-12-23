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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ChartDataPoint } from "@/types/arena";
import { DEFAULT_ARENA_MODELS, DEFAULT_STARTING_CAPITAL, CHART_CONFIG } from "@/lib/arena/constants";
import { useMemo, useState } from "react";

interface PerformanceChartProps {
  data: ChartDataPoint[];
  title?: string;
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

export function PerformanceChart({
  data,
  title = "Account Value Over Time",
}: PerformanceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL");
  const [valueDisplay, setValueDisplay] = useState<ValueDisplay>("dollar");

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
        converted[name] = ((value - DEFAULT_STARTING_CAPITAL) / DEFAULT_STARTING_CAPITAL) * 100;
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
                return (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    animationDuration={CHART_CONFIG.animationDuration}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
