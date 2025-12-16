"use client";

/**
 * Store Detail Page
 *
 * Shows detailed information about a model, agent, or tool.
 */

import { use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useServiceLists } from "@/hooks/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeftIcon,
  SparklesIcon,
  BotIcon,
  WrenchIcon,
  ExternalLinkIcon,
  CheckCircleIcon,
  CopyIcon,
} from "lucide-react";
import { useAgentStore } from "@/store/agentStore";
import { useToolStore } from "@/store/toolStore";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function StoreDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const type = searchParams.get("type") ?? "model";

  const { models, agents, tools, isLoading } = useServiceLists();
  const { selectedAgentId, setSelectedAgent } = useAgentStore();
  const { globalEnabledTools, toggleGlobalTool } = useToolStore();

  // Find the item based on type
  const item = useMemo(() => {
    const decodedId = decodeURIComponent(id);

    switch (type) {
      case "model":
        return models.find((m) => m.id === decodedId);
      case "agent":
        return agents.find((a) => a.agent_id === decodedId);
      case "tool":
        return tools.find((t) => t.agent_id === decodedId);
      default:
        return null;
    }
  }, [type, id, models, agents, tools]);

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="container max-w-4xl py-6">
        <Link href="/store">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Store
          </Button>
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-semibold mb-2">Not Found</h1>
          <p className="text-muted-foreground">
            The {type} you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  // Render based on type
  if (type === "model") {
    const model = item as (typeof models)[0];
    return (
      <div className="container max-w-4xl py-6">
        <Link href="/store">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Store
          </Button>
        </Link>

        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-muted">
            <SparklesIcon className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{model.name}</h1>
            <p className="text-muted-foreground font-mono text-sm">{model.id}</p>
          </div>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {model.contextLength && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Context Length</span>
                  <span className="font-medium">
                    {model.contextLength.toLocaleString()} tokens
                  </span>
                </div>
              )}
              {model.pricing && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Input Price</span>
                    <span className="font-medium">
                      ${model.pricing.prompt} / 1M tokens
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Output Price</span>
                    <span className="font-medium">
                      ${model.pricing.completion} / 1M tokens
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (type === "agent") {
    const agent = item as (typeof agents)[0];
    const isSelected = selectedAgentId === agent.agent_id;

    return (
      <div className="container max-w-4xl py-6">
        <Link href="/store?tab=agent">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Store
          </Button>
        </Link>

        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-muted">
            <BotIcon className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{agent.name}</h1>
              {agent.chat_completion && (
                <Badge variant="secondary">
                  <CheckCircleIcon className="h-3 w-3 mr-1" />
                  Chat Enabled
                </Badge>
              )}
            </div>
            {agent.description && (
              <p className="text-muted-foreground mt-1">{agent.description}</p>
            )}
          </div>
          {agent.chat_completion && (
            <Button
              variant={isSelected ? "secondary" : "default"}
              onClick={() => setSelectedAgent(isSelected ? null : agent.agent_id)}
            >
              {isSelected ? "Selected" : "Select Agent"}
            </Button>
          )}
        </div>

        <div className="grid gap-6">
          {agent.a2a_card && (
            <Card>
              <CardHeader>
                <CardTitle>Capabilities</CardTitle>
                <CardDescription>A2A Protocol Support</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {agent.a2a_card.capabilities.streaming && (
                    <Badge variant="outline">Streaming</Badge>
                  )}
                  {agent.a2a_card.capabilities.pushNotifications && (
                    <Badge variant="outline">Push Notifications</Badge>
                  )}
                  {agent.a2a_card.capabilities.stateTransitionHistory && (
                    <Badge variant="outline">State History</Badge>
                  )}
                </div>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">Input Modes</h4>
                  <div className="flex flex-wrap gap-1">
                    {agent.a2a_card.defaultInputModes.map((mode) => (
                      <Badge key={mode} variant="secondary" className="text-xs">
                        {mode}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Output Modes</h4>
                  <div className="flex flex-wrap gap-1">
                    {agent.a2a_card.defaultOutputModes.map((mode) => (
                      <Badge key={mode} variant="secondary" className="text-xs">
                        {mode}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {agent.a2a_card && agent.a2a_card.skills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
                <CardDescription>
                  {agent.a2a_card.skills.length} skills available
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {agent.a2a_card.skills.map((skill) => (
                    <div key={skill.id} className="p-3 rounded-lg border">
                      <div className="font-medium">{skill.name}</div>
                      {skill.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {skill.description}
                        </p>
                      )}
                      {skill.tags && skill.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skill.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (type === "tool") {
    const tool = item as (typeof tools)[0];
    const isEnabled = globalEnabledTools.includes(tool.agent_id);

    return (
      <div className="container max-w-4xl py-6">
        <Link href="/store?tab=tool">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Store
          </Button>
        </Link>

        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-muted">
            <WrenchIcon className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{tool.agent_name}</h1>
              {tool.metadata?.category && (
                <Badge variant="secondary">{tool.metadata.category}</Badge>
              )}
            </div>
            {tool.description && (
              <p className="text-muted-foreground mt-1">{tool.description}</p>
            )}
          </div>
          <Button
            variant={isEnabled ? "secondary" : "default"}
            onClick={() => toggleGlobalTool(tool.agent_id)}
          >
            {isEnabled ? "Enabled" : "Enable Tool"}
          </Button>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {tool.routing_key && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Routing Key</span>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {tool.routing_key}
                  </code>
                </div>
              )}
              <Separator />
              <div>
                <span className="text-muted-foreground">MCP Capabilities</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {tool.capabilities?.tools && (
                    <Badge variant="outline">Tools</Badge>
                  )}
                  {tool.capabilities?.prompts && (
                    <Badge variant="outline">Prompts</Badge>
                  )}
                  {tool.capabilities?.resources && (
                    <Badge variant="outline">Resources</Badge>
                  )}
                  {!tool.capabilities?.tools &&
                    !tool.capabilities?.prompts &&
                    !tool.capabilities?.resources && (
                      <span className="text-sm text-muted-foreground">
                        No capabilities specified
                      </span>
                    )}
                </div>
              </div>
              {tool.pricing?.per_call && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price per Call</span>
                    <span className="font-medium text-amber-600">
                      {tool.pricing.per_call} {tool.pricing.currency ?? "credits"}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {tool.metadata && (
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {tool.metadata.author && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Author</span>
                    <span>{tool.metadata.author}</span>
                  </div>
                )}
                {tool.metadata.version && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span>{tool.metadata.version}</span>
                  </div>
                )}
                {tool.metadata.tags && tool.metadata.tags.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">Tags</span>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tool.metadata.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {tool.metadata.documentation_url && (
                  <>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Documentation</span>
                      <a
                        href={tool.metadata.documentation_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        View Docs
                        <ExternalLinkIcon className="h-3 w-3" />
                      </a>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return null;
}
