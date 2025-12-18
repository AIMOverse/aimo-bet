"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AgentConfigForm } from "@/components/agent/AgentConfigForm";

export default function AgentPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-sm font-medium">Agent Configuration</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="container max-w-2xl py-6 px-4">
          <AgentConfigForm />
        </div>
      </div>
    </div>
  );
}
