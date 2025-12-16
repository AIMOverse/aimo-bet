/**
 * useTools Hook
 *
 * Fetches tools from API and combines with built-in tools.
 * Uses SWR for caching and revalidation.
 */

import useSWR from "swr";
import { BUILT_IN_TOOL_CONFIGS } from "@/config/tools";
import type {
  MCPToolInfo,
  MCPToolsResponse,
  BuiltInToolConfig,
  UnifiedToolItem,
} from "@/types/tools";

const fetcher = async (url: string): Promise<MCPToolsResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tools: ${response.status}`);
  }
  return response.json();
};

interface UseToolsReturn {
  /** Network tools from registry */
  networkTools: MCPToolInfo[];
  /** Built-in tools (always available) */
  builtInTools: BuiltInToolConfig[];
  /** Combined list for UI display */
  allTools: UnifiedToolItem[];
  /** Loading state */
  isLoading: boolean;
  /** Error (if any) */
  error: Error | undefined;
  /** Refetch tools */
  refetch: () => void;
}

/**
 * Hook to fetch and manage tool data
 */
export function useTools(): UseToolsReturn {
  const { data, error, isLoading, mutate } = useSWR<MCPToolsResponse>(
    "/api/tools",
    fetcher,
    {
      fallbackData: { data: [] },
      revalidateOnFocus: false,
      revalidateIfStale: true,
      dedupingInterval: 60000, // 1 minute
    }
  );

  const networkTools = data?.data ?? [];

  // Create unified tool list for UI
  const allTools: UnifiedToolItem[] = [
    // Built-in tools first
    ...BUILT_IN_TOOL_CONFIGS.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      source: "builtin" as const,
    })),
    // Network tools
    ...networkTools.map((t) => ({
      id: t.agent_id,
      name: t.agent_name,
      description: t.description,
      category: t.metadata?.category,
      source: "network" as const,
      endpoint: t.endpoint,
      pricing: t.pricing,
      capabilities: t.capabilities,
    })),
  ];

  return {
    networkTools,
    builtInTools: BUILT_IN_TOOL_CONFIGS,
    allTools,
    isLoading,
    error,
    refetch: () => mutate(),
  };
}

/**
 * Hook to get a single tool by ID
 */
export function useTool(toolId: string | null): {
  tool: UnifiedToolItem | null;
  isLoading: boolean;
} {
  const { allTools, isLoading } = useTools();

  const tool = toolId ? allTools.find((t) => t.id === toolId) ?? null : null;

  return { tool, isLoading };
}

/**
 * Check if a tool ID is a built-in tool
 */
export function isBuiltInTool(toolId: string): boolean {
  return BUILT_IN_TOOL_CONFIGS.some((t) => t.id === toolId);
}

/**
 * Filter tools by various criteria
 */
export function filterTools(
  tools: UnifiedToolItem[],
  filters: {
    search?: string;
    source?: "builtin" | "network" | "all";
    category?: string;
    hasCapability?: keyof NonNullable<UnifiedToolItem["capabilities"]>;
  }
): UnifiedToolItem[] {
  return tools.filter((tool) => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesName = tool.name.toLowerCase().includes(searchLower);
      const matchesDescription = tool.description
        ?.toLowerCase()
        .includes(searchLower);
      if (!matchesName && !matchesDescription) {
        return false;
      }
    }

    // Source filter
    if (filters.source && filters.source !== "all") {
      if (tool.source !== filters.source) {
        return false;
      }
    }

    // Category filter
    if (filters.category) {
      if (tool.category !== filters.category) {
        return false;
      }
    }

    // Capability filter (for network tools)
    if (filters.hasCapability && tool.source === "network") {
      if (!tool.capabilities?.[filters.hasCapability]) {
        return false;
      }
    }

    return true;
  });
}
