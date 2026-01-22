"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getModelSeriesIcon } from "@/components/icons/model-series";
import { AnimateNumber } from "motion-plus/react";
import { Trophy, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import type { LeaderboardEntry } from "@/hooks/leaderboard/useLeaderboard";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  loading?: boolean;
  lastUpdated?: Date | null;
}

type SortKey =
  | "rank"
  | "accountValue"
  | "returnPercent"
  | "totalPnL"
  | "winRate"
  | "totalTrades"
  | "biggestWin"
  | "biggestLoss"
  | "sharpeRatio"
  | "totalInferenceCost";

type SortDirection = "asc" | "desc";

// Format helpers
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatSharpe(value: number | null): string {
  if (value === null) return "-";
  return value.toFixed(3);
}

// Simple rank display
function RankBadge({ rank }: { rank: number }) {
  return (
    <div className="flex items-center justify-center w-8 h-8 text-muted-foreground font-medium">
      {rank}
    </div>
  );
}

// Model cell with avatar and name
function ModelCell({ entry }: { entry: LeaderboardEntry }) {
  const icon = getModelSeriesIcon(entry.series);
  const initial = entry.modelName.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <Avatar
        className="size-7 ring-2 ring-offset-1 bg-background"
        style={{ ["--tw-ring-color" as string]: entry.chartColor }}
      >
        {icon?.type === "component" ? (
          <icon.Component className="size-full p-1" />
        ) : icon?.type === "image" ? (
          <>
            <AvatarImage
              src={icon.src}
              alt={`${entry.modelName} logo`}
              className="p-1"
            />
            <AvatarFallback
              className="text-xs font-semibold"
              style={{ backgroundColor: `${entry.chartColor}20` }}
            >
              {initial}
            </AvatarFallback>
          </>
        ) : (
          <AvatarFallback
            className="text-xs font-semibold"
            style={{ backgroundColor: `${entry.chartColor}20` }}
          >
            {initial}
          </AvatarFallback>
        )}
      </Avatar>
      <span className="font-medium text-sm whitespace-nowrap">
        {entry.modelName}
      </span>
    </div>
  );
}

// Sortable column header
function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDirection,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;

  return (
    <button
      className={cn(
        "flex items-center gap-1 hover:text-foreground transition-colors text-xs font-medium uppercase tracking-wider",
        isActive ? "text-foreground" : "text-muted-foreground",
        className,
      )}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {isActive ? (
        currentDirection === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

// Value cell with color coding and AnimateNumber
function ValueCell({
  value,
  format = "currency",
  colorCode = true,
}: {
  value: number | null;
  format?: "currency" | "percent" | "number" | "sharpe";
  colorCode?: boolean;
}) {
  if (value === null) {
    return <span className="text-muted-foreground">-</span>;
  }

  const isPositive = value >= 0;
  const colorClass = colorCode
    ? isPositive
      ? "text-green-500"
      : "text-red-500"
    : "";

  // Configure AnimateNumber based on format
  const getAnimateConfig = () => {
    switch (format) {
      case "currency":
        return {
          format: {
            style: "currency" as const,
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
          locales: "en-US",
        };
      case "percent":
        return {
          format: {
            style: "percent" as const,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
            signDisplay: "exceptZero" as const,
          },
          locales: "en-US",
          // Divide by 100 since AnimateNumber with percent style expects decimal
          transformValue: true,
        };
      case "sharpe":
        return {
          format: {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
            signDisplay: "auto" as const,
          },
          locales: "en-US",
        };
      default:
        return {
          format: {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          },
          locales: "en-US",
        };
    }
  };

  const config = getAnimateConfig();
  const displayValue = format === "percent" ? value / 100 : value;

  return (
    <span className={cn("font-mono tabular-nums text-sm", colorClass)}>
      <AnimateNumber
        format={config.format}
        locales={config.locales}
        transition={{ duration: 0.3 }}
      >
        {displayValue}
      </AnimateNumber>
    </span>
  );
}

export function LeaderboardTable({
  entries,
  loading,
  lastUpdated,
}: LeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Handle sort toggle
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Default direction based on metric type
      const descendingDefaults: SortKey[] = [
        "accountValue",
        "returnPercent",
        "totalPnL",
        "winRate",
        "biggestWin",
        "sharpeRatio",
      ];
      setSortDirection(descendingDefaults.includes(key) ? "desc" : "asc");
    }
  };

  // Sort entries
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const aVal: number | null = a[sortKey];
      const bVal: number | null = b[sortKey];

      // Handle null values - push them to the end
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (sortDirection === "asc") {
        return aVal - bVal;
      }
      return bVal - aVal;
    });
  }, [entries, sortKey, sortDirection]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-pulse text-muted-foreground">
            Loading leaderboard...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Leaderboard
          </CardTitle>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <ScrollArea className="w-full">
          <div className="min-w-[1100px]">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 py-3 px-6 border-b bg-muted/30">
              <SortableHeader
                label="Rank"
                sortKey="rank"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1"
              />
              <div className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Model
              </div>
              <SortableHeader
                label="Acct Value"
                sortKey="accountValue"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
              <SortableHeader
                label="Return %"
                sortKey="returnPercent"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
              <SortableHeader
                label="Total P&L"
                sortKey="totalPnL"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
              <SortableHeader
                label="Inference"
                sortKey="totalInferenceCost"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
              <SortableHeader
                label="Win Rate"
                sortKey="winRate"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
              <SortableHeader
                label="Best"
                sortKey="biggestWin"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
              <SortableHeader
                label="Worst"
                sortKey="biggestLoss"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
              <SortableHeader
                label="Sharpe"
                sortKey="sharpeRatio"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
              <SortableHeader
                label="Trades"
                sortKey="totalTrades"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="col-span-1 justify-end"
              />
            </div>

            {/* Table Body */}
            {sortedEntries.map((entry) => (
              <div
                key={entry.modelId}
                className="grid grid-cols-12 gap-2 py-3 px-6 border-b last:border-0 hover:bg-muted/50 transition-colors items-center"
              >
                <div className="col-span-1">
                  <RankBadge rank={entry.rank} />
                </div>
                <div className="col-span-2">
                  <ModelCell entry={entry} />
                </div>
                <div className="col-span-1 text-right">
                  <ValueCell
                    value={entry.accountValue}
                    format="currency"
                    colorCode={false}
                  />
                </div>
                <div className="col-span-1 text-right">
                  <ValueCell value={entry.returnPercent} format="percent" />
                </div>
                <div className="col-span-1 text-right">
                  <ValueCell value={entry.totalPnL} format="currency" />
                </div>
                <div className="col-span-1 text-right">
                  <ValueCell
                    value={entry.totalInferenceCost}
                    format="currency"
                    colorCode={false}
                  />
                </div>
                <div className="col-span-1 text-right">
                  <span className="font-mono tabular-nums text-sm">
                    <AnimateNumber
                      format={{
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      }}
                      locales="en-US"
                      transition={{ duration: 0.3 }}
                    >
                      {entry.winRate}
                    </AnimateNumber>
                    %
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  <ValueCell
                    value={entry.biggestWin}
                    format="currency"
                    colorCode={entry.biggestWin !== null}
                  />
                </div>
                <div className="col-span-1 text-right">
                  <ValueCell value={entry.biggestLoss} format="currency" />
                </div>
                <div className="col-span-1 text-right">
                  <ValueCell
                    value={entry.sharpeRatio}
                    format="sharpe"
                    colorCode={entry.sharpeRatio !== null}
                  />
                </div>
                <div className="col-span-1 text-right">
                  <span className="font-mono tabular-nums text-sm">
                    <AnimateNumber
                      format={{
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }}
                      locales="en-US"
                      transition={{ duration: 0.3 }}
                    >
                      {entry.totalTrades}
                    </AnimateNumber>
                  </span>
                </div>
              </div>
            ))}

            {sortedEntries.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No agents participating yet
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
