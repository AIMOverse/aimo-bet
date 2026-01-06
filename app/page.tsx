"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MarketTicker } from "@/components/index/MarketTicker";
import { AppTabs } from "@/components/layout/AppTabs";
import { PerformanceChart } from "@/components/chart/PerformanceChart";
import { TradesFeed } from "@/components/trades/TradesFeed";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { PositionsTable } from "@/components/positions/PositionsTable";
import { usePerformanceChart } from "@/hooks/chart/usePerformanceChart";
import { useSessionTrades } from "@/hooks/trades/useTrades";
import { useSessionPositions } from "@/hooks/positions/usePositions";
import { useLivePrices } from "@/hooks/index/useLivePrices";
import { useGlobalSession } from "@/hooks/useGlobalSession";
import type { ArenaTab } from "@/lib/supabase/types";

/**
 * Home page - renders the Alpha Arena trading dashboard.
 */
export default function Home() {
  const [activeTab, setActiveTab] = useState<ArenaTab>("trades");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Fetch the global session ID dynamically
  const { sessionId } = useGlobalSession();

  // Fetch real data from hooks
  const {
    chartData,
    latestValues,
    deadModels,
    loading: performanceLoading,
  } = usePerformanceChart({
    sessionId,
    since: "2026-01-06T06:50:00Z", // 2026-01-06 14:50 +08:00
  });
  const { trades, isLoading: tradesLoading } = useSessionTrades(sessionId);
  const { positions, isLoading: positionsLoading } =
    useSessionPositions(sessionId);
  const livePrices = useLivePrices();

  // Render the right panel content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "trades":
        return <TradesFeed trades={trades} selectedModelId={selectedModelId} />;
      case "chat":
        return (
          <ChatInterface
            sessionId={sessionId}
            selectedModelId={selectedModelId}
          />
        );
      case "positions":
        return (
          <PositionsTable
            positions={positions}
            selectedModelId={selectedModelId}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <AppHeader />

      {/* Market Ticker Strip */}
      <div className="border-b bg-background/50">
        <MarketTicker {...livePrices} />
      </div>

      {/* Main Content: Left (Chart) + Right (Tabs + Content) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Chart with integrated Legend */}
        <div className="flex flex-col border-r min-h-0 overflow-auto lg:flex-1">
          <div className="flex-1 flex flex-col gap-4">
            <PerformanceChart
              data={chartData}
              latestValues={latestValues}
              deadModels={deadModels}
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
          <div className="flex-1 overflow-auto">{renderTabContent()}</div>
        </div>
      </div>
    </div>
  );
}
