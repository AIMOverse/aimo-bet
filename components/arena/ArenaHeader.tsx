"use client";

import { Settings, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ArenaHeaderProps {
  sessionStatus?: "setup" | "running" | "paused" | "completed";
  onStart?: () => void;
  onPause?: () => void;
  onReset?: () => void;
}

export function ArenaHeader({
  sessionStatus = "setup",
  onStart,
  onPause,
  onReset,
}: ArenaHeaderProps) {
  const getStatusBadge = () => {
    const statusStyles = {
      setup: "bg-muted text-muted-foreground",
      running: "bg-green-500/10 text-green-500",
      paused: "bg-yellow-500/10 text-yellow-500",
      completed: "bg-blue-500/10 text-blue-500",
    };

    const statusLabels = {
      setup: "Setup",
      running: "Running",
      paused: "Paused",
      completed: "Completed",
    };

    return (
      <span
        className={`px-2 py-1 rounded-md text-xs font-medium ${statusStyles[sessionStatus]}`}
      >
        {statusLabels[sessionStatus]}
      </span>
    );
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Alpha Arena</h1>
        {getStatusBadge()}
      </div>

      <div className="flex items-center gap-2">
        {/* Session controls */}
        {sessionStatus === "setup" || sessionStatus === "paused" ? (
          <Button
            variant="default"
            size="sm"
            onClick={onStart}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            {sessionStatus === "setup" ? "Start Session" : "Resume"}
          </Button>
        ) : sessionStatus === "running" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onPause}
            className="gap-2"
          >
            <Pause className="h-4 w-4" />
            Pause
          </Button>
        ) : null}

        {sessionStatus !== "setup" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        )}

        {/* Settings dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Arena Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Manage Models</DropdownMenuItem>
            <DropdownMenuItem>Session Configuration</DropdownMenuItem>
            <DropdownMenuItem>Export Data</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              Clear History
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
