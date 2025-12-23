"use client";

import { TrendingUp, ArrowRightLeft, MessageSquare, Briefcase } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArenaStore } from "@/store/arenaStore";
import type { ArenaTab } from "@/types/arena";

const ARENA_TABS: { value: ArenaTab; label: string; icon: React.ReactNode }[] = [
  {
    value: "performance",
    label: "Performance",
    icon: <TrendingUp className="h-4 w-4" />,
  },
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

export function ArenaTabs() {
  const { activeTab, setActiveTab } = useArenaStore();

  return (
    <div className="px-6 py-2 border-b bg-muted/30">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ArenaTab)}
      >
        <TabsList>
          {ARENA_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
