"use client";

/**
 * StoreHeader Component
 *
 * Header for the store page with tabs, search, and view mode toggle.
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StoreTab = "model" | "agent" | "tool";
export type ViewMode = "grid" | "list";

interface StoreHeaderProps {
  activeTab: StoreTab;
  onTabChange: (tab: StoreTab) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  search: string;
  onSearchChange: (search: string) => void;
  counts?: {
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
  activeTab,
  onTabChange,
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
  counts,
}: StoreHeaderProps) {
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
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "gap-2",
              activeTab === tab.id && "bg-secondary"
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {counts && (
              <span className="text-xs text-muted-foreground ml-1">
                ({counts[tab.id === "model" ? "models" : tab.id === "agent" ? "agents" : "tools"]})
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${activeTab}s...`}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
});
