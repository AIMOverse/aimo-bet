"use client";

/**
 * ChatToolSelector Component
 *
 * Multi-select dropdown for enabling/disabling tools.
 * Shows both built-in and network tools.
 */

import { memo, useMemo } from "react";
import { useTools } from "@/hooks/chat";
import { useToolStore } from "@/store/toolStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WrenchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatToolSelectorProps {
  className?: string;
}

export const ChatToolSelector = memo(function ChatToolSelector({
  className,
}: ChatToolSelectorProps) {
  const { allTools, isLoading } = useTools();
  const { globalEnabledTools, toggleGlobalTool } = useToolStore();

  // Count enabled tools
  const enabledCount = globalEnabledTools.length;

  // Group tools by source
  const groupedTools = useMemo(() => {
    const builtin = allTools.filter((t) => t.source === "builtin");
    const network = allTools.filter((t) => t.source === "network");
    return { builtin, network };
  }, [allTools]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-2 text-muted-foreground", className)}
        >
          <WrenchIcon className="h-4 w-4" />
          {enabledCount > 0 && (
            <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
              {enabledCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Tools</span>
          {enabledCount > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {enabledCount} enabled
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Built-in tools */}
        {groupedTools.builtin.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal py-1">
              Built-in Tools
            </DropdownMenuLabel>
            {groupedTools.builtin.map((tool) => (
              <DropdownMenuCheckboxItem
                key={tool.id}
                checked={globalEnabledTools.includes(tool.id)}
                onCheckedChange={() => toggleGlobalTool(tool.id)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{tool.name}</span>
                  {tool.description && (
                    <span className="text-xs text-muted-foreground truncate">
                      {tool.description}
                    </span>
                  )}
                </div>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}

        {/* Network tools */}
        {groupedTools.network.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal py-1">
              Network Tools
            </DropdownMenuLabel>
            {groupedTools.network.map((tool) => (
              <DropdownMenuCheckboxItem
                key={tool.id}
                checked={globalEnabledTools.includes(tool.id)}
                onCheckedChange={() => toggleGlobalTool(tool.id)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{tool.name}</span>
                  {tool.description && (
                    <span className="text-xs text-muted-foreground truncate">
                      {tool.description}
                    </span>
                  )}
                  {tool.pricing?.per_call && (
                    <span className="text-xs text-amber-600">
                      {tool.pricing.per_call} {tool.pricing.currency ?? "credits"}/call
                    </span>
                  )}
                </div>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}

        {/* Empty state */}
        {allTools.length === 0 && !isLoading && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No tools available
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            Loading tools...
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
