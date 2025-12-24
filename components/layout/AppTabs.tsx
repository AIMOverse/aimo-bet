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
import { DEFAULT_ARENA_MODELS } from "@/lib/arena/constants";
import type { ArenaTab } from "@/types/arena";

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

export function AppTabs({
  activeTab,
  onTabChange,
  selectedModelId,
  onModelChange,
}: AppTabsProps) {
  return (
    <div className="border-b px-4 py-2 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
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
          <SelectTrigger className="w-35 h-9 text-xs">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All Models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {DEFAULT_ARENA_MODELS.map((model) => (
              <SelectItem
                key={model.modelIdentifier}
                value={model.modelIdentifier}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: model.chartColor }}
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
