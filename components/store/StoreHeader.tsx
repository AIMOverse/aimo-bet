"use client";

/**
 * StoreHeader Component
 *
 * Header for the store page with tabs, search, filters, and view mode toggle.
 */

import { memo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  LayoutGridIcon,
  LayoutListIcon,
  SearchIcon,
  BotIcon,
  WrenchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { ProviderFilter, CategoryFilter } from "./filters";
import type { StoreTab, ViewMode } from "@/types/filters";

interface StoreHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  counts: {
    models: number;
    agents: number;
    tools: number;
  };
}

const tabs: Array<{ id: StoreTab; label: string; icon: React.ReactNode }> = [
  { id: "model", label: "Models", icon: <SparklesIcon className="h-4 w-4" /> },
  { id: "agent", label: "Agents", icon: <BotIcon className="h-4 w-4" /> },
  { id: "tool", label: "Tools", icon: <WrenchIcon className="h-4 w-4" /> },
];

export const StoreHeader = memo(function StoreHeader({
  viewMode,
  onViewModeChange,
  counts,
}: StoreHeaderProps) {
  const {
    search,
    setSearch,
    tab,
    setTab,
    providers,
    categories,
    clearFilters,
  } = useStoreFiltersStore();

  const hasActiveFilters = search || providers.length > 0 || categories.length > 0;

  return (
    <div className="flex flex-col gap-4 pb-4 border-b">
      {/* Title and view mode */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Store</h1>
        <ButtonGroup>
          <Button
            variant={viewMode === "list" ? "secondary" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onViewModeChange("list")}
          >
            <LayoutListIcon className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onViewModeChange("grid")}
          >
            <LayoutGridIcon className="h-4 w-4" />
          </Button>
        </ButtonGroup>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1">
        {tabs.map((tabItem) => (
          <Button
            key={tabItem.id}
            variant={tab === tabItem.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab(tabItem.id)}
            className={cn(
              "gap-2",
              tab === tabItem.id && "bg-secondary"
            )}
          >
            {tabItem.icon}
            <span>{tabItem.label}</span>
            <span className="text-xs text-muted-foreground ml-1">
              ({counts[tabItem.id === "model" ? "models" : tabItem.id === "agent" ? "agents" : "tools"]})
            </span>
          </Button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${tab}s...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Show provider filter for models tab */}
        {tab === "model" && <ProviderFilter />}

        {/* Show category filter for tools tab */}
        {tab === "tool" && <CategoryFilter />}

        {/* Clear filters button */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
});

// Re-export types for backwards compatibility
export type { StoreTab, ViewMode } from "@/types/filters";
