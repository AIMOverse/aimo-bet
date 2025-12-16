"use client";

/**
 * StoreList Component
 *
 * Displays models, agents, or tools in a grid or list view.
 */

import { memo, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  SparklesIcon,
  BotIcon,
  WrenchIcon,
  ExternalLinkIcon,
  CheckCircleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoreTab, ViewMode } from "./StoreHeader";
import type { ModelDefinition } from "@/types/models";
import type { AgentCatalogItemWithA2A } from "@/types/agents";
import type { MCPToolInfo } from "@/types/tools";

interface StoreListProps {
  activeTab: StoreTab;
  viewMode: ViewMode;
  search: string;
  models: ModelDefinition[];
  agents: AgentCatalogItemWithA2A[];
  tools: MCPToolInfo[];
  isLoading: boolean;
}

export const StoreList = memo(function StoreList({
  activeTab,
  viewMode,
  search,
  models,
  agents,
  tools,
  isLoading,
}: StoreListProps) {
  // Filter items based on search
  const filteredModels = useMemo(() => {
    if (!search) return models;
    const searchLower = search.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(searchLower) ||
        m.id.toLowerCase().includes(searchLower)
    );
  }, [models, search]);

  const filteredAgents = useMemo(() => {
    if (!search) return agents;
    const searchLower = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(searchLower) ||
        a.description?.toLowerCase().includes(searchLower)
    );
  }, [agents, search]);

  const filteredTools = useMemo(() => {
    if (!search) return tools;
    const searchLower = search.toLowerCase();
    return tools.filter(
      (t) =>
        t.agent_name.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        t.routing_key?.toLowerCase().includes(searchLower)
    );
  }, [tools, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const containerClass = cn(
    viewMode === "grid"
      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      : "flex flex-col gap-2"
  );

  return (
    <div className={containerClass}>
      {activeTab === "model" &&
        filteredModels.map((model) => (
          <ModelCard key={model.id} model={model} viewMode={viewMode} />
        ))}
      {activeTab === "agent" &&
        filteredAgents.map((agent) => (
          <AgentCard key={agent.agent_id} agent={agent} viewMode={viewMode} />
        ))}
      {activeTab === "tool" &&
        filteredTools.map((tool) => (
          <ToolCard key={tool.agent_id} tool={tool} viewMode={viewMode} />
        ))}

      {/* Empty states */}
      {activeTab === "model" && filteredModels.length === 0 && (
        <EmptyState type="model" search={search} />
      )}
      {activeTab === "agent" && filteredAgents.length === 0 && (
        <EmptyState type="agent" search={search} />
      )}
      {activeTab === "tool" && filteredTools.length === 0 && (
        <EmptyState type="tool" search={search} />
      )}
    </div>
  );
});

// ============================================================================
// Model Card
// ============================================================================

interface ModelCardProps {
  model: ModelDefinition;
  viewMode: ViewMode;
}

const ModelCard = memo(function ModelCard({ model, viewMode }: ModelCardProps) {
  if (viewMode === "list") {
    return (
      <Link href={`/store/${encodeURIComponent(model.id)}?type=model`}>
        <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
          <SparklesIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{model.name}</div>
            <div className="text-sm text-muted-foreground truncate">
              {model.id}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {model.contextLength ? `${(model.contextLength / 1000).toFixed(0)}k ctx` : ""}
          </div>
          <ExternalLinkIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/store/${encodeURIComponent(model.id)}?type=model`}>
      <Card className="hover:bg-accent/50 transition-colors h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <SparklesIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">{model.name}</CardTitle>
          <CardDescription className="truncate">{model.id}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {model.contextLength && (
              <Badge variant="secondary">
                {(model.contextLength / 1000).toFixed(0)}k context
              </Badge>
            )}
            {model.pricing && (
              <Badge variant="outline">
                ${model.pricing.prompt}/M tokens
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});

// ============================================================================
// Agent Card
// ============================================================================

interface AgentCardProps {
  agent: AgentCatalogItemWithA2A;
  viewMode: ViewMode;
}

const AgentCard = memo(function AgentCard({ agent, viewMode }: AgentCardProps) {
  if (viewMode === "list") {
    return (
      <Link href={`/store/${agent.agent_id}?type=agent`}>
        <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
          <BotIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{agent.name}</div>
            <div className="text-sm text-muted-foreground truncate">
              {agent.description ?? "No description"}
            </div>
          </div>
          {agent.chat_completion && (
            <Badge variant="secondary" className="flex-shrink-0">
              <CheckCircleIcon className="h-3 w-3 mr-1" />
              Chat
            </Badge>
          )}
          <ExternalLinkIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/store/${agent.agent_id}?type=agent`}>
      <Card className="hover:bg-accent/50 transition-colors h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <BotIcon className="h-5 w-5 text-muted-foreground" />
            {agent.chat_completion && (
              <Badge variant="secondary">
                <CheckCircleIcon className="h-3 w-3 mr-1" />
                Chat
              </Badge>
            )}
          </div>
          <CardTitle className="text-lg">{agent.name}</CardTitle>
          <CardDescription className="line-clamp-2">
            {agent.description ?? "No description"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agent.a2a_card && (
            <div className="flex flex-wrap gap-1">
              {agent.a2a_card.skills.slice(0, 3).map((skill) => (
                <Badge key={skill.id} variant="outline" className="text-xs">
                  {skill.name}
                </Badge>
              ))}
              {agent.a2a_card.skills.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{agent.a2a_card.skills.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
});

// ============================================================================
// Tool Card
// ============================================================================

interface ToolCardProps {
  tool: MCPToolInfo;
  viewMode: ViewMode;
}

const ToolCard = memo(function ToolCard({ tool, viewMode }: ToolCardProps) {
  if (viewMode === "list") {
    return (
      <Link href={`/store/${tool.agent_id}?type=tool`}>
        <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
          <WrenchIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{tool.agent_name}</div>
            <div className="text-sm text-muted-foreground truncate">
              {tool.description ?? tool.routing_key ?? "No description"}
            </div>
          </div>
          {tool.pricing?.per_call && (
            <Badge variant="outline" className="flex-shrink-0">
              {tool.pricing.per_call} {tool.pricing.currency ?? "credits"}/call
            </Badge>
          )}
          <ExternalLinkIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/store/${tool.agent_id}?type=tool`}>
      <Card className="hover:bg-accent/50 transition-colors h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <WrenchIcon className="h-5 w-5 text-muted-foreground" />
            {tool.metadata?.category && (
              <Badge variant="secondary" className="text-xs">
                {tool.metadata.category}
              </Badge>
            )}
          </div>
          <CardTitle className="text-lg">{tool.agent_name}</CardTitle>
          <CardDescription className="line-clamp-2">
            {tool.description ?? tool.routing_key ?? "No description"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {tool.capabilities?.tools && (
              <Badge variant="outline" className="text-xs">Tools</Badge>
            )}
            {tool.capabilities?.prompts && (
              <Badge variant="outline" className="text-xs">Prompts</Badge>
            )}
            {tool.capabilities?.resources && (
              <Badge variant="outline" className="text-xs">Resources</Badge>
            )}
            {tool.pricing?.per_call && (
              <Badge variant="outline" className="text-xs text-amber-600">
                {tool.pricing.per_call} {tool.pricing.currency ?? "credits"}/call
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  type: "model" | "agent" | "tool";
  search: string;
}

const EmptyState = memo(function EmptyState({ type, search }: EmptyStateProps) {
  const Icon = type === "model" ? SparklesIcon : type === "agent" ? BotIcon : WrenchIcon;

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h3 className="text-lg font-medium">No {type}s found</h3>
      {search && (
        <p className="text-sm text-muted-foreground mt-1">
          Try adjusting your search query
        </p>
      )}
    </div>
  );
});
