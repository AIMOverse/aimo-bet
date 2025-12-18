"use client";

/**
 * AgentConfigForm Component
 *
 * Main form for configuring the custom agent.
 * Allows setting name, description, model, tools, system prompt, and settings.
 */

import { memo, useCallback } from "react";
import { useAgentStore } from "@/store/agentStore";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AgentModelSelector } from "./AgentModelSelector";
import { AgentToolSelector } from "./AgentToolSelector";
import { ChevronDownIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

export const AgentConfigForm = memo(function AgentConfigForm() {
  const { customAgent, updateCustomAgent, resetCustomAgent } = useAgentStore();

  const handleSave = useCallback(() => {
    if (!customAgent.name.trim()) {
      toast.error("Please enter an agent name");
      return;
    }
    if (!customAgent.modelId) {
      toast.error("Please select a model");
      return;
    }
    toast.success("Agent configuration saved");
  }, [customAgent.name, customAgent.modelId]);

  const handleReset = useCallback(() => {
    resetCustomAgent();
    toast.info("Agent configuration reset to defaults");
  }, [resetCustomAgent]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">My Agent</h2>
          <p className="text-sm text-muted-foreground">
            Configure your custom agent with model, tools, and instructions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcwIcon className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave}>
            <SaveIcon className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Name and describe your agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="agent-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="agent-name"
              placeholder="My Agent"
              value={customAgent.name}
              onChange={(e) => updateCustomAgent({ name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="agent-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="agent-description"
              placeholder="Describe what your agent does..."
              value={customAgent.description ?? ""}
              onChange={(e) => updateCustomAgent({ description: e.target.value })}
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Model</CardTitle>
          <CardDescription>Select the LLM for your agent</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentModelSelector
            value={customAgent.modelId}
            onChange={(modelId) => updateCustomAgent({ modelId })}
          />
        </CardContent>
      </Card>

      {/* Tools Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Tools</CardTitle>
          <CardDescription>Select tools your agent can use</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentToolSelector
            value={customAgent.tools}
            onChange={(tools) => updateCustomAgent({ tools })}
          />
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
          <CardDescription>Instructions that define your agent&apos;s behavior</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="You are a helpful assistant that..."
            value={customAgent.systemPrompt ?? ""}
            onChange={(e) => updateCustomAgent({ systemPrompt: e.target.value })}
            className="min-h-[160px] font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Advanced Settings</CardTitle>
                  <CardDescription>Configure agent loop and model parameters</CardDescription>
                </div>
                <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 border-t pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="max-steps" className="text-sm font-medium">
                    Max Steps
                  </label>
                  <Input
                    id="max-steps"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="10"
                    value={customAgent.settings?.maxSteps ?? 10}
                    onChange={(e) =>
                      updateCustomAgent({
                        settings: {
                          ...customAgent.settings,
                          maxSteps: parseInt(e.target.value) || 10,
                        },
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum tool calls before stopping (1-100)
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="temperature" className="text-sm font-medium">
                    Temperature
                  </label>
                  <Input
                    id="temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    placeholder="0.7"
                    value={customAgent.settings?.temperature ?? 0.7}
                    onChange={(e) =>
                      updateCustomAgent({
                        settings: {
                          ...customAgent.settings,
                          temperature: parseFloat(e.target.value) || 0.7,
                        },
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Randomness of responses (0-2)
                  </p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
});
