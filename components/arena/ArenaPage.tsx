"use client";

import { ArenaHeader } from "./ArenaHeader";
import { ArenaTabs } from "./ArenaTabs";
import { PerformanceChart } from "./PerformanceChart";
import { ModelLegend } from "./ModelLegend";
import { TradesFeed } from "@/components/trades/TradesFeed";
import { BroadcastFeed } from "@/components/broadcast/BroadcastFeed";
import { PositionsTable } from "@/components/positions/PositionsTable";
import { useArenaStore } from "@/store/arenaStore";
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
import { useMemo } from "react";

export function ArenaPage() {
  const { activeTab } = useArenaStore();

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
        return <TradesFeed trades={trades} />;
      case "chat":
        return <BroadcastFeed broadcasts={broadcasts} />;
      case "positions":
        return <PositionsTable positions={positions} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <ArenaHeader />

      {/* Main Content: Left (Chart) + Right (Tabs + Content) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Chart + Legend */}
        <div className="flex flex-col border-r min-h-0 overflow-auto lg:flex-1">
          <div className="flex-1 p-4 flex flex-col gap-4">
            <PerformanceChart data={chartData} />
            <ModelLegend values={latestValues} leaderboard={leaderboard} />
          </div>
        </div>

        {/* Right Panel - Tabs at top + Content */}
        <div className="flex flex-col min-h-0 lg:w-[420px] lg:shrink-0">
          <ArenaTabs />
          <div className="flex-1 overflow-auto p-4">{renderTabContent()}</div>
        </div>
      </div>
    </div>
  );
}
