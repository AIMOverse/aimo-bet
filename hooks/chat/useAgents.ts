/**
 * useAgents Hook
 *
 * Fetches agent catalog from API with fallback to defaults.
 * Uses SWR for caching and revalidation.
 */

import useSWR from "swr";
import { DEFAULT_AGENTS } from "@/config/agents";
import type { AgentCatalogItemWithA2A, AgentCatalogResponse } from "@/types/agents";

const fetcher = async (url: string): Promise<AgentCatalogResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch agents: ${response.status}`);
  }
  return response.json();
};

interface UseAgentsReturn {
  /** List of agents */
  agents: AgentCatalogItemWithA2A[];
  /** Loading state */
  isLoading: boolean;
  /** Error (if any) */
  error: Error | undefined;
  /** Refetch agents */
  refetch: () => void;
}

/**
 * Hook to fetch and manage agent catalog data
 */
export function useAgents(): UseAgentsReturn {
  const { data, error, isLoading, mutate } = useSWR<AgentCatalogResponse>(
    "/api/agents",
    fetcher,
    {
      fallbackData: { data: DEFAULT_AGENTS },
      revalidateOnFocus: false,
      revalidateIfStale: true,
      dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    agents: data?.data ?? DEFAULT_AGENTS,
    isLoading,
    error,
    refetch: () => mutate(),
  };
}

/**
 * Hook to get a single agent by ID
 */
export function useAgent(agentId: string | null): {
  agent: AgentCatalogItemWithA2A | null;
  isLoading: boolean;
} {
  const { agents, isLoading } = useAgents();

  const agent = agentId
    ? agents.find((a) => a.agent_id === agentId) ?? null
    : null;

  return { agent, isLoading };
}

/**
 * Filter agents by various criteria
 */
export function filterAgents(
  agents: AgentCatalogItemWithA2A[],
  filters: {
    search?: string;
    chatEnabled?: boolean;
    hasA2A?: boolean;
    inputModes?: string[];
    outputModes?: string[];
  }
): AgentCatalogItemWithA2A[] {
  return agents.filter((agent) => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesName = agent.name.toLowerCase().includes(searchLower);
      const matchesDescription = agent.description
        ?.toLowerCase()
        .includes(searchLower);
      if (!matchesName && !matchesDescription) {
        return false;
      }
    }

    // Chat enabled filter
    if (filters.chatEnabled && !agent.chat_completion) {
      return false;
    }

    // A2A enabled filter
    if (filters.hasA2A && !agent.a2a_card) {
      return false;
    }

    // Input modes filter
    if (filters.inputModes && filters.inputModes.length > 0) {
      if (!agent.a2a_card) return false;
      const hasMatchingInput = filters.inputModes.some((mode) =>
        agent.a2a_card!.defaultInputModes.includes(mode)
      );
      if (!hasMatchingInput) return false;
    }

    // Output modes filter
    if (filters.outputModes && filters.outputModes.length > 0) {
      if (!agent.a2a_card) return false;
      const hasMatchingOutput = filters.outputModes.some((mode) =>
        agent.a2a_card!.defaultOutputModes.includes(mode)
      );
      if (!hasMatchingOutput) return false;
    }

    return true;
  });
}
