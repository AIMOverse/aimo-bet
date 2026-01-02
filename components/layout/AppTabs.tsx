"use client";

import { ArrowRightLeft, MessageSquare, Briefcase, Filter } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODELS, getModelById } from "@/lib/ai/models";
import type { ArenaTab } from "@/lib/supabase/types";

const APP_TABS: { value: ArenaTab; label: string; icon: React.ReactNode }[] = [
  {
    value: "trades",
    label: "Trades",
    icon: <ArrowRightLeft className="h-4 w-4" />,
  },
  {
    value: "chat",
    label: "Model Chat",
    icon: <MessageSquare className="h-4 w-4" />,
  },
  {
    value: "positions",
    label: "Positions",
    icon: <Briefcase className="h-4 w-4" />,
  },
];

interface AppTabsProps {
  activeTab: ArenaTab;
  onTabChange: (tab: ArenaTab) => void;
  selectedModelId: string | null;
  onModelChange: (modelId: string | null) => void;
}

// Capitalize first letter of series name for display
function formatSeriesName(series: string): string {
  return series.charAt(0).toUpperCase() + series.slice(1);
}

export function AppTabs({
  activeTab,
  onTabChange,
  selectedModelId,
  onModelChange,
}: AppTabsProps) {
  // Get selected model's series name for display
  const selectedModel = selectedModelId ? getModelById(selectedModelId) : null;
  const displayValue = selectedModel?.series
    ? formatSeriesName(selectedModel.series)
    : "All";

  return (
    <div className="border-b">
      <div className="flex items-center justify-between">
        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => onTabChange(value as ArenaTab)}
        >
          <TabsList className="h-9">
            {APP_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-1.5 text-xs px-2.5"
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Model Filter */}
        <Select
          value={selectedModelId || "all"}
          onValueChange={(value) =>
            onModelChange(value === "all" ? null : value)
          }
        >
          <SelectTrigger className="w-28 h-9 text-xs">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{displayValue}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {MODELS.filter((m) => m.enabled).map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: model.chartColor || "#6366f1" }}
                  />
                  <span>{model.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
