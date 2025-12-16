"use client";

/**
 * Store Page
 *
 * Browse models, agents, and tools available on the AiMo Network.
 */

import { useState } from "react";
import { StoreHeader, StoreList, type StoreTab, type ViewMode } from "@/components/store";
import { useServiceLists } from "@/hooks/store";

export default function StorePage() {
  const [activeTab, setActiveTab] = useState<StoreTab>("model");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");

  const { models, agents, tools, isLoading, error } = useServiceLists();

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <StoreHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        counts={{
          models: models.length,
          agents: agents.length,
          tools: tools.length,
        }}
      />

      {error && (
        <div className="text-sm text-destructive p-4 rounded-lg bg-destructive/10">
          Failed to load data. Please try again later.
        </div>
      )}

      <StoreList
        activeTab={activeTab}
        viewMode={viewMode}
        search={search}
        models={models}
        agents={agents}
        tools={tools}
        isLoading={isLoading}
      />
    </div>
  );
}
