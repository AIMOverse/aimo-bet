"use client";

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
import { useModels } from "@/hooks/chat";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { useState, memo } from "react";

export const ChatModelSelector = memo(function ChatModelSelector() {
  const [open, setOpen] = useState(false);
  const { models, selectedModel, setSelectedModel } = useModels();

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ModelSelectorLogo provider="openai" />
          <span className="truncate max-w-[120px]">
            {selectedModel?.name ?? "Select model"}
          </span>
          <ChevronDownIcon className="size-3.5 opacity-50" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          <ModelSelectorGroup heading="OpenAI Models">
            {models.map((model) => (
              <ModelSelectorItem
                key={model.id}
                value={model.id}
                onSelect={() => {
                  setSelectedModel(model.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2"
              >
                <ModelSelectorLogo provider="openai" />
                <ModelSelectorName>{model.name}</ModelSelectorName>
                {model.id === selectedModel?.id && (
                  <CheckIcon className="size-4 ml-auto" />
                )}
              </ModelSelectorItem>
            ))}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
});
