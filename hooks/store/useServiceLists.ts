/**
 * useServiceLists Hook
 *
 * Fetches models, agents, and tools in parallel for the store page.
 * Uses SWR for caching and revalidation.
 */

import useSWR from "swr";
import { MODELS } from "@/config/models";
import { DEFAULT_AGENTS } from "@/config/agents";
import type { ModelDefinition } from "@/types/models";
import type { AgentCatalogItemWithA2A, AgentCatalogResponse } from "@/types/agents";
import type { MCPToolInfo, MCPToolsResponse } from "@/types/tools";

// ============================================================================
// Types
// ============================================================================

interface ModelsResponse {
  data: ModelDefinition[];
}

interface UseServiceListsReturn {
  /** Models list */
  models: ModelDefinition[];
  /** Agents list */
  agents: AgentCatalogItemWithA2A[];
  /** Tools list */
  tools: MCPToolInfo[];
  /** Loading state */
  isLoading: boolean;
  /** Error (if any) */
  error: Error | undefined;
  /** Refetch all data */
  refetch: () => void;
}

// ============================================================================
// Fetchers
// ============================================================================

const fetcher = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to fetch models, agents, and tools for the store page.
 * All requests are made in parallel.
 */
export function useServiceLists(): UseServiceListsReturn {
  // Fetch models
  const {
    data: modelsData,
    error: modelsError,
    isLoading: modelsLoading,
    mutate: mutateModels,
  } = useSWR<ModelsResponse>("/api/models", fetcher, {
    fallbackData: { data: MODELS },
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  // Fetch agents
  const {
    data: agentsData,
    error: agentsError,
    isLoading: agentsLoading,
    mutate: mutateAgents,
  } = useSWR<AgentCatalogResponse>("/api/agents", fetcher, {
    fallbackData: { data: DEFAULT_AGENTS },
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  // Fetch tools
  const {
    data: toolsData,
    error: toolsError,
    isLoading: toolsLoading,
    mutate: mutateTools,
  } = useSWR<MCPToolsResponse>("/api/tools", fetcher, {
    fallbackData: { data: [] },
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  // Combine errors (return first error if any)
  const error = modelsError || agentsError || toolsError;

  // Loading is true if any request is loading
  const isLoading = modelsLoading || agentsLoading || toolsLoading;

  // Refetch all data
  const refetch = () => {
    mutateModels();
    mutateAgents();
    mutateTools();
  };

  return {
    models: modelsData?.data ?? MODELS,
    agents: agentsData?.data ?? DEFAULT_AGENTS,
    tools: toolsData?.data ?? [],
    isLoading,
    error,
    refetch,
  };
}
