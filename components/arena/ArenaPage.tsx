"use client";

import { ArenaHeader } from "./ArenaHeader";
import { ArenaTabs } from "./ArenaTabs";
import { PerformanceChart } from "./PerformanceChart";
import { ModelLegend } from "./ModelLegend";
import { TradesFeed } from "@/components/trades/TradesFeed";
import { BroadcastFeed } from "@/components/broadcast/BroadcastFeed";
import { PositionsTable } from "@/components/positions/PositionsTable";
import { useArenaStore } from "@/store/arenaStore";
import { generateMockChartData, generateMockLeaderboard, getLatestModelValues } from "@/lib/arena/mock/performance";
import { generateMockTradesWithModels, generateMockBroadcasts, generateMockPositions } from "@/lib/arena/mock/trades";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";

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
  const renderTabContent = () => {
    switch (activeTab) {
      case "performance":
        return (
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Performance Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Real-time performance metrics and rankings are displayed in the chart legend below.</p>
              <p className="mt-2">Select a different tab to view trades, model chat, or positions.</p>
            </CardContent>
          </Card>
        );
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
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr,420px] overflow-hidden">
        {/* Left Panel - Chart + Legend */}
        <div className="flex flex-col border-r min-h-0 overflow-auto">
          <div className="flex-1 p-4 flex flex-col gap-4">
            <PerformanceChart data={chartData} />
            <ModelLegend values={latestValues} leaderboard={leaderboard} />
          </div>
        </div>

        {/* Right Panel - Tabs at top + Content */}
        <div className="flex flex-col min-h-0">
          <ArenaTabs />
          <div className="flex-1 overflow-auto p-4">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
