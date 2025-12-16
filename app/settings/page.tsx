"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-sm font-medium">Settings</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="container max-w-4xl py-6">
          <h1 className="text-2xl font-semibold mb-6">Settings</h1>
          <p className="text-muted-foreground">
            Settings page coming soon...
          </p>
        </div>
      </div>
    </div>
  );
}
