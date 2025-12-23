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
import type { ChartDataPoint } from "@/types/arena";
import { DEFAULT_ARENA_MODELS, DEFAULT_STARTING_CAPITAL, CHART_CONFIG } from "@/lib/arena/constants";
import { useMemo } from "react";

interface PerformanceChartProps {
  data: ChartDataPoint[];
  title?: string;
}

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

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
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
              <span className="font-medium">{formatCurrency(entry.value)}</span>
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

  // Calculate Y-axis domain
  const yDomain = useMemo(() => {
    let min = DEFAULT_STARTING_CAPITAL;
    let max = DEFAULT_STARTING_CAPITAL;

    data.forEach((point) => {
      Object.entries(point).forEach(([key, value]) => {
        if (key !== "timestamp" && typeof value === "number") {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });

    // Add 5% padding
    const padding = (max - min) * 0.05;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [data]);

  return (
    <Card className="flex-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: CHART_CONFIG.height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={CHART_CONFIG.margin}
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
                tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={{ stroke: "hsl(var(--muted))" }}
                axisLine={{ stroke: "hsl(var(--muted))" }}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={DEFAULT_STARTING_CAPITAL}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeOpacity={0.5}
              />
              {modelNames.map((name) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={colorMap.get(name) || "#6366f1"}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  animationDuration={CHART_CONFIG.animationDuration}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
