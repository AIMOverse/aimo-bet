"use client";

import useSWR from "swr";
import { POLLING_INTERVALS } from "../constants";
import { useArenaModels } from "./usePerformance";

// ============================================================================
// Types for dflow positions
// ============================================================================

export interface DflowPosition {
  market_ticker: string;
  outcome: "yes" | "no";
  mint: string;
  quantity: number;
  wallet: string;
  modelId?: string;
  modelName?: string;
}

// ============================================================================
// Fetch positions from dflow API
// ============================================================================

async function fetchDflowPositions(wallet: string): Promise<DflowPosition[]> {
  const response = await fetch(`/api/dflow/positions?wallet=${wallet}`);
  if (!response.ok) {
    throw new Error("Failed to fetch positions");
  }
  const data = await response.json();
  return data.positions || [];
}

// ============================================================================
// Hook to fetch positions for a specific model (by wallet)
// ============================================================================

interface UsePositionsOptions {
  sessionId: string;
  modelId?: string; // Filter by specific model
}

export function usePositions({ sessionId, modelId }: UsePositionsOptions) {
  const { models } = useArenaModels();

  // Get wallets for models
  const walletToModel = new Map<string, { id: string; name: string }>();
  if (modelId) {
    const model = models?.find((m) => m.id === modelId);
    if (model?.walletAddress) {
      walletToModel.set(model.walletAddress, { id: model.id, name: model.name });
    }
  } else {
    models?.forEach((m) => {
      if (m.walletAddress) {
        walletToModel.set(m.walletAddress, { id: m.id, name: m.name });
      }
    });
  }

  const wallets = Array.from(walletToModel.keys());

  // Fetch positions from dflow for each wallet
  const { data, isLoading, error, mutate } = useSWR<DflowPosition[]>(
    wallets.length > 0 ? `dflow/positions/${wallets.join(",")}` : null,
    async () => {
      const results = await Promise.all(
        wallets.map(async (wallet) => {
          const positions = await fetchDflowPositions(wallet);
          const modelInfo = walletToModel.get(wallet);
          return positions.map((p) => ({
            ...p,
            modelId: modelInfo?.id,
            modelName: modelInfo?.name,
          }));
        })
      );
      return results.flat();
    },
    {
      refreshInterval: POLLING_INTERVALS.positions,
    }
  );

  return {
    positions: data || [],
    isLoading,
    error,
    mutate,
  };
}

// ============================================================================
// Hook to fetch all positions for a session (across all models with wallets)
// ============================================================================

export function useSessionPositions(sessionId: string | null) {
  if (!sessionId) {
    return {
      positions: [] as DflowPosition[],
      isLoading: false,
      error: null,
      mutate: () => Promise.resolve(),
    };
  }

  return usePositions({ sessionId });
}

// ============================================================================
// Legacy hook interface for backward compatibility
// ============================================================================

/**
 * @deprecated Use usePositions with sessionId and modelId instead
 */
export function usePortfolioPositions(portfolioId: string | null, openOnly = true) {
  // This legacy interface is deprecated
  // Return empty positions as we've migrated to wallet-based positions
  return {
    positions: [] as DflowPosition[],
    isLoading: false,
    error: null,
    mutate: () => Promise.resolve(),
  };
}
