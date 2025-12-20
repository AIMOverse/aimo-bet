"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { useModels } from "@/hooks/chat";
import {
  ChevronDownIcon,
  CheckIcon,
  MessageSquareIcon,
  ImageIcon,
} from "lucide-react";
import { useState, useMemo, useCallback, memo } from "react";
import type { ModelDefinition } from "@/types/models";

type ModelCategory = "chat" | "image";

function getModelCategory(model: ModelDefinition): ModelCategory {
  const modalities = model.outputModalities ?? ["text"];
  return modalities.includes("image") ? "image" : "chat";
}

function filterModelsByCategory(
  models: ModelDefinition[],
  category: ModelCategory,
): ModelDefinition[] {
  return models.filter((model) => getModelCategory(model) === category);
}

function filterModelsBySearch(
  models: ModelDefinition[],
  search: string,
): ModelDefinition[] {
  if (!search) return models;
  const lowerSearch = search.toLowerCase();
  return models.filter(
    (model) =>
      model.name.toLowerCase().includes(lowerSearch) ||
      model.provider.toLowerCase().includes(lowerSearch) ||
      model.description?.toLowerCase().includes(lowerSearch),
  );
}

export const ChatModelSelector = memo(function ChatModelSelector() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModelCategory>("chat");
  const [search, setSearch] = useState("");
  const { models, selectedModel, setSelectedModel } = useModels();

  const chatModels = useMemo(
    () => filterModelsByCategory(models, "chat"),
    [models],
  );
  const imageModels = useMemo(
    () => filterModelsByCategory(models, "image"),
    [models],
  );

  const filteredChatModels = useMemo(
    () => filterModelsBySearch(chatModels, search),
    [chatModels, search],
  );
  const filteredImageModels = useMemo(
    () => filterModelsBySearch(imageModels, search),
    [imageModels, search],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);

      if (value) {
        const chatMatches = filterModelsBySearch(chatModels, value).length > 0;
        const imageMatches =
          filterModelsBySearch(imageModels, value).length > 0;

        // Auto-switch tab if matches exist only in the other tab
        if (!chatMatches && imageMatches && activeTab === "chat") {
          setActiveTab("image");
        } else if (!imageMatches && chatMatches && activeTab === "image") {
          setActiveTab("chat");
        }
      }
    },
    [chatModels, imageModels, activeTab],
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      setOpen(false);
      setSearch("");
    },
    [setSelectedModel],
  );

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSearch("");
    }
  }, []);

  const selectedCategory = selectedModel
    ? getModelCategory(selectedModel)
    : "chat";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          {selectedModel && (
            <ModelSelectorLogo provider={selectedModel.provider} />
          )}
          <span className="truncate max-w-30">
            {selectedModel?.name ?? "Select model"}
          </span>
          <ChevronDownIcon className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[340px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search models..."
            value={search}
            onValueChange={handleSearchChange}
          />
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as ModelCategory)}
            className="gap-0"
          >
            <div className="border-b px-3 py-2">
              <TabsList className="w-full">
                <TabsTrigger value="chat" className="flex-1 gap-1.5">
                  <MessageSquareIcon className="size-3.5" />
                  Chat
                </TabsTrigger>
                <TabsTrigger value="image" className="flex-1 gap-1.5">
                  <ImageIcon className="size-3.5" />
                  Image
                </TabsTrigger>
              </TabsList>
            </div>

            <CommandList>
              <TabsContent value="chat" className="mt-0">
                {filteredChatModels.length === 0 ? (
                  <CommandEmpty>No chat models found.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredChatModels.map((model) => (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={() => handleSelectModel(model.id)}
                        className="flex items-center gap-2"
                      >
                        <ModelSelectorLogo provider={model.provider} />
                        <span className="flex-1 truncate">{model.name}</span>
                        {model.id === selectedModel?.id && (
                          <CheckIcon className="size-4 ml-auto" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </TabsContent>

              <TabsContent value="image" className="mt-0">
                {filteredImageModels.length === 0 ? (
                  <CommandEmpty>No image models found.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredImageModels.map((model) => (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={() => handleSelectModel(model.id)}
                        className="flex items-center gap-2"
                      >
                        <ModelSelectorLogo provider={model.provider} />
                        <span className="flex-1 truncate">{model.name}</span>
                        {model.id === selectedModel?.id && (
                          <CheckIcon className="size-4 ml-auto" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </TabsContent>
            </CommandList>
          </Tabs>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
