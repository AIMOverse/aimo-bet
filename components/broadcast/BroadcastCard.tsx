"use client";

import { BarChart3, ArrowRightLeft, MessageCircle } from "lucide-react";
import type { BroadcastWithModel } from "@/types/arena";
import { cn } from "@/lib/utils";

interface BroadcastCardProps {
  broadcast: BroadcastWithModel;
}

// Format time ago
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Get icon for broadcast type
function BroadcastIcon({ type }: { type: string }) {
  switch (type) {
    case "analysis":
      return <BarChart3 className="h-4 w-4" />;
    case "trade":
      return <ArrowRightLeft className="h-4 w-4" />;
    case "commentary":
      return <MessageCircle className="h-4 w-4" />;
    default:
      return <MessageCircle className="h-4 w-4" />;
  }
}

// Get badge style for broadcast type
function getTypeBadgeStyle(type: string): string {
  switch (type) {
    case "analysis":
      return "bg-blue-500/10 text-blue-500";
    case "trade":
      return "bg-green-500/10 text-green-500";
    case "commentary":
      return "bg-purple-500/10 text-purple-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function BroadcastCard({ broadcast }: BroadcastCardProps) {
  const badgeStyle = getTypeBadgeStyle(broadcast.type);

  return (
    <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: broadcast.model.chartColor }}
          >
            {broadcast.model.name.charAt(0)}
          </div>
          <div>
            <span className="font-medium text-sm block">
              {broadcast.model.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTimeAgo(broadcast.createdAt)}
            </span>
          </div>
        </div>

        <span
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
            badgeStyle
          )}
        >
          <BroadcastIcon type={broadcast.type} />
          {broadcast.type}
        </span>
      </div>

      {/* Content */}
      <p className="text-sm leading-relaxed">{broadcast.content}</p>
    </div>
  );
}
