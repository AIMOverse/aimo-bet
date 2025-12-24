"use client";

import { useState, useMemo } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppTabs } from "@/components/layout/AppTabs";
import { PerformanceChart } from "@/components/index/PerformanceChart";
import { TradesFeed } from "@/components/trades/TradesFeed";
import { BroadcastFeed } from "@/components/broadcast/BroadcastFeed";
import { PositionsTable } from "@/components/positions/PositionsTable";
import {
  generateMockChartData,
  generateMockLeaderboard,
  getLatestModelValues,
} from "@/lib/arena/mock/performance";
import {
  generateMockTradesWithModels,
  generateMockBroadcasts,
  generateMockPositions,
} from "@/lib/arena/mock/trades";
import type { ArenaTab } from "@/types/arena";

/**
 * Home page - renders the Alpha Arena trading dashboard.
 */
export default function Home() {
  const [activeTab, setActiveTab] = useState<ArenaTab>("trades");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Generate mock data (in production, this would come from SWR hooks)
  const chartData = useMemo(() => generateMockChartData(24, 30), []);
  const leaderboard = useMemo(() => generateMockLeaderboard(), []);
  const trades = useMemo(() => generateMockTradesWithModels(5), []);
  const broadcasts = useMemo(
    () => generateMockBroadcasts("mock-session", 20),
    [],
  );
  const positions = useMemo(() => generateMockPositions("mock-portfolio"), []);
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
          <BroadcastFeed
            broadcasts={broadcasts}
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
            <PerformanceChart
              data={chartData}
              latestValues={latestValues}
              leaderboard={leaderboard}
            />
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
