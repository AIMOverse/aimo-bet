"use client";

/**
 * AgentToolSelector Component
 *
 * Multi-select for agent tools.
 * Controlled component that works with form state.
 */

import { memo, useMemo, useCallback } from "react";
import { useTools } from "@/hooks/chat";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AgentToolSelectorProps {
  value: string[];
  onChange: (tools: string[]) => void;
}

export const AgentToolSelector = memo(function AgentToolSelector({
  value,
  onChange,
}: AgentToolSelectorProps) {
  const { allTools, isLoading } = useTools();

  // Group tools by source
  const groupedTools = useMemo(() => {
    const builtin = allTools.filter((t) => t.source === "builtin");
    const network = allTools.filter((t) => t.source === "network");
    return { builtin, network };
  }, [allTools]);

  const handleToggle = useCallback(
    (toolId: string) => {
      if (value.includes(toolId)) {
        onChange(value.filter((id) => id !== toolId));
      } else {
        onChange([...value, toolId]);
      }
    },
    [value, onChange]
  );

  const handleSelectAll = useCallback(() => {
    const allIds = allTools.map((t) => t.id);
    onChange(allIds);
  }, [allTools, onChange]);

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Loading tools...
      </div>
    );
  }

  if (allTools.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No tools available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {value.length} of {allTools.length} tools selected
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-xs text-primary hover:underline"
          >
            Select all
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Tools List */}
      <ScrollArea className="h-[300px] rounded-md border p-4">
        <div className="space-y-4">
          {/* Built-in tools */}
          {groupedTools.builtin.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                Built-in Tools
                <Badge variant="secondary" className="text-xs">
                  {groupedTools.builtin.filter((t) => value.includes(t.id)).length}/
                  {groupedTools.builtin.length}
                </Badge>
              </h4>
              <div className="space-y-2">
                {groupedTools.builtin.map((tool) => (
                  <label
                    key={tool.id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={value.includes(tool.id)}
                      onCheckedChange={() => handleToggle(tool.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{tool.name}</p>
                      {tool.description && (
                        <p className="text-xs text-muted-foreground">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Network tools */}
          {groupedTools.network.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                Network Tools
                <Badge variant="secondary" className="text-xs">
                  {groupedTools.network.filter((t) => value.includes(t.id)).length}/
                  {groupedTools.network.length}
                </Badge>
              </h4>
              <div className="space-y-2">
                {groupedTools.network.map((tool) => (
                  <label
                    key={tool.id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={value.includes(tool.id)}
                      onCheckedChange={() => handleToggle(tool.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{tool.name}</p>
                      {tool.description && (
                        <p className="text-xs text-muted-foreground">
                          {tool.description}
                        </p>
                      )}
                      {tool.pricing?.per_call && (
                        <p className="text-xs text-amber-600">
                          {tool.pricing.per_call} {tool.pricing.currency ?? "credits"}/call
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
