"use client";

/**
 * ChatAgentSelector Component
 *
 * Dropdown for selecting an AI agent.
 * Displays custom agent and preset agents from the network registry.
 */

import { memo, useMemo } from "react";
import { useAgents } from "@/hooks/chat";
import { useAgentStore, CUSTOM_AGENT_ID } from "@/store/agentStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BotIcon, CheckIcon, ChevronDownIcon, SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ChatAgentSelectorProps {
  className?: string;
}

export const ChatAgentSelector = memo(function ChatAgentSelector({
  className,
}: ChatAgentSelectorProps) {
  const { agents, isLoading } = useAgents();
  const {
    selectedAgentId,
    selectedAgentSource,
    customAgent,
    setSelectedAgent,
    selectCustomAgent,
    clearSelection,
    isCustomAgentConfigured,
  } = useAgentStore();

  // Find selected preset agent details
  const selectedPresetAgent = useMemo(() => {
    if (selectedAgentSource !== "preset" || !selectedAgentId) return null;
    return agents.find((a) => a.agent_id === selectedAgentId) ?? null;
  }, [selectedAgentId, selectedAgentSource, agents]);

  // Determine display name
  const displayName = useMemo(() => {
    if (selectedAgentSource === "custom") {
      return customAgent.name || "My Agent";
    }
    if (selectedPresetAgent) {
      return selectedPresetAgent.name;
    }
    return "No Agent";
  }, [selectedAgentSource, customAgent.name, selectedPresetAgent]);

  // Filter to only show chat-enabled agents
  const chatEnabledAgents = useMemo(() => {
    return agents.filter((agent) => agent.chat_completion);
  }, [agents]);

  // Check if custom agent is selected
  const isCustomSelected = selectedAgentId === CUSTOM_AGENT_ID && selectedAgentSource === "custom";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-2 text-muted-foreground", className)}
        >
          <BotIcon className="h-4 w-4" />
          <span className="max-w-[100px] truncate">{displayName}</span>
          <ChevronDownIcon className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Select Agent</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* No agent option */}
        <DropdownMenuItem
          onClick={() => clearSelection()}
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

        <DropdownMenuSeparator />

        {/* Custom Agent (My Agent) */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal py-1">
          My Agent
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => selectCustomAgent()}
          className="flex items-center justify-between"
          disabled={!isCustomAgentConfigured()}
        >
          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate">{customAgent.name || "My Agent"}</span>
            {isCustomAgentConfigured() ? (
              <span className="text-xs text-muted-foreground truncate">
                {customAgent.description || "Custom configured agent"}
              </span>
            ) : (
              <span className="text-xs text-amber-600">
                Not configured yet
              </span>
            )}
          </div>
          {isCustomSelected && <CheckIcon className="h-4 w-4 ml-2 flex-shrink-0" />}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/agent" className="flex items-center gap-2 text-muted-foreground">
            <SettingsIcon className="h-3.5 w-3.5" />
            <span className="text-xs">Configure agent</span>
          </Link>
        </DropdownMenuItem>

        {/* Preset agents */}
        {chatEnabledAgents.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal py-1">
              Preset Agents
            </DropdownMenuLabel>
            {chatEnabledAgents.map((agent) => (
              <DropdownMenuItem
                key={agent.agent_id}
                onClick={() => setSelectedAgent(agent.agent_id, "preset")}
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
                {selectedAgentSource === "preset" && selectedAgentId === agent.agent_id && (
                  <CheckIcon className="h-4 w-4 ml-2 flex-shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </>
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
