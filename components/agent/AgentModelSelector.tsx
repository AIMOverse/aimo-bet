"use client";

/**
 * AgentModelSelector Component
 *
 * Model selector for agent configuration.
 * Controlled component that works with form state.
 */

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { MODELS, getModelById } from "@/config/models";
import { ChevronDownIcon, CheckIcon } from "lucide-react";

interface AgentModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
}

export const AgentModelSelector = memo(function AgentModelSelector({
  value,
  onChange,
}: AgentModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const selectedModel = getModelById(value);

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <ModelSelectorLogo provider="openai" />
            <span className="truncate">
              {selectedModel?.name ?? "Select a model"}
            </span>
          </div>
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          <ModelSelectorGroup heading="Available Models">
            {MODELS.map((model) => (
              <ModelSelectorItem
                key={model.id}
                value={model.id}
                onSelect={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2"
              >
                <ModelSelectorLogo provider="openai" />
                <div className="flex-1 min-w-0">
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                  {model.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {model.description}
                    </p>
                  )}
                </div>
                {model.id === value && (
                  <CheckIcon className="size-4 shrink-0" />
                )}
              </ModelSelectorItem>
            ))}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
});
