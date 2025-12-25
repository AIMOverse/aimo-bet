"use client";

import { useState, useMemo } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppTabs } from "@/components/layout/AppTabs";
import { PerformanceChart } from "@/components/index/PerformanceChart";
import { TradesFeed } from "@/components/trades/TradesFeed";
import { ModelChatFeed } from "@/components/chat/ModelChatFeed";
import { PositionsTable } from "@/components/positions/PositionsTable";
import { usePerformance } from "@/hooks/index/usePerformance";
import { useSessionTrades } from "@/hooks/trades/useTrades";
import { useSessionPositions } from "@/hooks/positions/usePositions";
import type { ArenaTab, ChartDataPoint } from "@/types/arena";

/**
 * Get latest values for each model from chart data (for legend display).
 */
function getLatestModelValues(
  chartData: ChartDataPoint[],
): Map<string, number> {
  const latestValues = new Map<string, number>();

  if (chartData.length === 0) return latestValues;

  const latestPoint = chartData[chartData.length - 1];

  Object.entries(latestPoint).forEach(([key, value]) => {
    if (key !== "timestamp" && typeof value === "number") {
      latestValues.set(key, value);
    }
  });

  return latestValues;
}

// Session ID for the arena (in production, this would come from routing/state)
const SESSION_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Home page - renders the Alpha Arena trading dashboard.
 */
export default function Home() {
  const [activeTab, setActiveTab] = useState<ArenaTab>("trades");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Fetch real data from hooks
  const { chartData, isLoading: performanceLoading } =
    usePerformance(SESSION_ID);
  const { trades, isLoading: tradesLoading } = useSessionTrades(SESSION_ID);
  const { positions, isLoading: positionsLoading } =
    useSessionPositions(SESSION_ID);

  // Calculate latest values for legend
  const latestValues = useMemo(
    () => getLatestModelValues(chartData),
    [chartData],
  );

  // Render the right panel content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "trades":
        return <TradesFeed trades={trades} selectedModelId={selectedModelId} />;
      case "chat":
        return (
          <ModelChatFeed
            sessionId={SESSION_ID}
            selectedModelId={selectedModelId}
          />
        );
      case "positions":
        return <PositionsTable positions={positions} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <AppHeader />

      {/* Main Content: Left (Chart) + Right (Tabs + Content) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Chart with integrated Legend */}
        <div className="flex flex-col border-r min-h-0 overflow-auto lg:flex-1">
          <div className="flex-1 p-4 flex flex-col gap-4">
            <PerformanceChart data={chartData} latestValues={latestValues} />
          </div>
        </div>

        {/* Right Panel - Tabs at top + Content */}
        <div className="flex flex-col min-h-0 lg:w-[420px] lg:shrink-0">
          <AppTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            selectedModelId={selectedModelId}
            onModelChange={setSelectedModelId}
          />
          <div className="flex-1 overflow-auto p-4">{renderTabContent()}</div>
        </div>
      </div>
    </div>
  );
}
