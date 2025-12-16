"use client";

/**
 * ChatAgentSelector Component
 *
 * Dropdown for selecting an AI agent.
 * Displays available agents from the network registry.
 */

import { memo, useMemo } from "react";
import { useAgents } from "@/hooks/chat";
import { useAgentStore } from "@/store/agentStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BotIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatAgentSelectorProps {
  className?: string;
}

export const ChatAgentSelector = memo(function ChatAgentSelector({
  className,
}: ChatAgentSelectorProps) {
  const { agents, isLoading } = useAgents();
  const { selectedAgentId, setSelectedAgent, clearAgent } = useAgentStore();

  // Find selected agent details
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find((a) => a.agent_id === selectedAgentId) ?? null;
  }, [selectedAgentId, agents]);

  // Filter to only show chat-enabled agents
  const chatEnabledAgents = useMemo(() => {
    return agents.filter((agent) => agent.chat_completion);
  }, [agents]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-2 text-muted-foreground", className)}
        >
          <BotIcon className="h-4 w-4" />
          <span className="max-w-[100px] truncate">
            {selectedAgent?.name ?? "No Agent"}
          </span>
          <ChevronDownIcon className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Select Agent</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* No agent option */}
        <DropdownMenuItem
          onClick={() => clearAgent()}
          className="flex items-center justify-between"
        >
          <div className="flex flex-col">
            <span>No Agent</span>
            <span className="text-xs text-muted-foreground">
              Use model directly
            </span>
          </div>
          {!selectedAgentId && <CheckIcon className="h-4 w-4" />}
        </DropdownMenuItem>

        {chatEnabledAgents.length > 0 && <DropdownMenuSeparator />}

        {/* Agent list */}
        {chatEnabledAgents.map((agent) => (
          <DropdownMenuItem
            key={agent.agent_id}
            onClick={() => setSelectedAgent(agent.agent_id)}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate">{agent.name}</span>
              {agent.description && (
                <span className="text-xs text-muted-foreground truncate">
                  {agent.description}
                </span>
              )}
            </div>
            {selectedAgentId === agent.agent_id && (
              <CheckIcon className="h-4 w-4 ml-2 flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}

        {/* Empty state */}
        {chatEnabledAgents.length === 0 && !isLoading && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No agents available
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            Loading agents...
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
