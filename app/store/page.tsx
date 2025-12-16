"use client";

/**
 * Store Page
 *
 * Browse models, agents, and tools available on the AiMo Network.
 */

import { useState } from "react";
import { StoreHeader, StoreList, type ViewMode } from "@/components/store";
import { useFilteredServices } from "@/hooks/store";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default function StorePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const { tab } = useStoreFiltersStore();
  const {
    filteredModels,
    filteredAgents,
    filteredTools,
    isLoading,
    error,
    counts,
  } = useFilteredServices();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-sm font-medium">Store</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="container max-w-6xl py-6 space-y-6">
          <StoreHeader
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            counts={counts}
          />

          {error && (
            <div className="text-sm text-destructive p-4 rounded-lg bg-destructive/10">
              Failed to load data. Please try again later.
            </div>
          )}

          <StoreList
            activeTab={tab}
            viewMode={viewMode}
            search="" // Search is now handled by the store
            models={filteredModels}
            agents={filteredAgents}
            tools={filteredTools}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
