"use client";

import { ArenaHeader } from "./ArenaHeader";
import { ArenaTabs } from "./ArenaTabs";
import { PerformanceChart } from "./PerformanceChart";
import { ModelLegend } from "./ModelLegend";
import { Leaderboard } from "./Leaderboard";
import { TradesFeed } from "@/components/trades/TradesFeed";
import { BroadcastFeed } from "@/components/broadcast/BroadcastFeed";
import { PositionsTable } from "@/components/positions/PositionsTable";
import { useArenaStore } from "@/store/arenaStore";
import { generateMockChartData, generateMockLeaderboard, getLatestModelValues } from "@/lib/arena/mock/performance";
import { generateMockTradesWithModels, generateMockBroadcasts, generateMockPositions } from "@/lib/arena/mock/trades";
import { useMemo } from "react";

export function ArenaPage() {
  const { activeTab } = useArenaStore();

  // Generate mock data (in production, this would come from SWR hooks)
  const chartData = useMemo(() => generateMockChartData(24, 30), []);
  const leaderboard = useMemo(() => generateMockLeaderboard(), []);
  const trades = useMemo(() => generateMockTradesWithModels(5), []);
  const broadcasts = useMemo(() => generateMockBroadcasts("mock-session", 20), []);
  const positions = useMemo(() => generateMockPositions("mock-portfolio"), []);
  const latestValues = useMemo(() => getLatestModelValues(chartData), [chartData]);

  // Render the right panel content based on active tab
  const renderRightPanel = () => {
    switch (activeTab) {
      case "performance":
        return <Leaderboard entries={leaderboard} />;
      case "trades":
        return <TradesFeed trades={trades} />;
      case "chat":
        return <BroadcastFeed broadcasts={broadcasts} />;
      case "positions":
        return <PositionsTable positions={positions} />;
      default:
        return <Leaderboard entries={leaderboard} />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ArenaHeader />

      <ArenaTabs />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-6 p-6 overflow-hidden">
        {/* Left panel - Always shows performance chart */}
        <div className="flex flex-col gap-4 min-h-0">
          <PerformanceChart data={chartData} />
          <ModelLegend values={latestValues} />
        </div>

        {/* Right panel - Changes based on tab */}
        <div className="min-h-0 overflow-auto">
          {renderRightPanel()}
        </div>
      </div>
    </div>
  );
}
