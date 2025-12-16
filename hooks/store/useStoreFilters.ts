import { useMemo } from "react";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { useServiceLists } from "./useServiceLists";

export function useFilteredServices() {
  const { models, agents, tools, isLoading, error } = useServiceLists();
  const { search, providers, categories, tab } = useStoreFiltersStore();

  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          model.name?.toLowerCase().includes(searchLower) ||
          model.id?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Provider filter (extract provider from model ID)
      if (providers.length > 0) {
        const modelProvider = model.id?.split("/")[0] || "";
        if (!providers.includes(modelProvider)) return false;
      }

      return true;
    });
  }, [models, search, providers]);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          agent.name?.toLowerCase().includes(searchLower) ||
          agent.description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [agents, search]);

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          tool.agent_name?.toLowerCase().includes(searchLower) ||
          tool.description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (categories.length > 0) {
        const toolCategory = tool.metadata?.category || "Uncategorized";
        if (!categories.includes(toolCategory)) return false;
      }

      return true;
    });
  }, [tools, search, categories]);

  // Return the appropriate filtered list based on active tab
  const currentModels = tab === "model" ? filteredModels : models;
  const currentAgents = tab === "agent" ? filteredAgents : agents;
  const currentTools = tab === "tool" ? filteredTools : tools;

  return {
    models: currentModels,
    agents: currentAgents,
    tools: currentTools,
    // Always return filtered versions for display
    filteredModels,
    filteredAgents,
    filteredTools,
    isLoading,
    error,
    counts: {
      models: filteredModels.length,
      agents: filteredAgents.length,
      tools: filteredTools.length,
    },
    totalCounts: {
      models: models.length,
      agents: agents.length,
      tools: tools.length,
    },
  };
}
