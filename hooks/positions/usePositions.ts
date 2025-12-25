"use client";

import useSWR from "swr";
import { POLLING_INTERVALS } from "@/config/arena";
import { MODELS } from "@/lib/ai/models/models";

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
// Hook to fetch positions for models
// ============================================================================

interface UsePositionsOptions {
  sessionId: string;
  modelId?: string; // Filter by specific model
}

export function usePositions({ sessionId, modelId }: UsePositionsOptions) {
  // Get wallets for models from models config
  const walletToModel = new Map<string, { id: string; name: string }>();
  if (modelId) {
    const model = MODELS.find((m) => m.id === modelId);
    if (model?.walletAddress) {
      walletToModel.set(model.walletAddress, {
        id: model.id,
        name: model.name,
      });
    }
  } else {
    MODELS.forEach((m) => {
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
        }),
      );
      return results.flat();
    },
    {
      refreshInterval: POLLING_INTERVALS.positions,
    },
  );

  return {
    positions: data || [],
    isLoading,
    error,
    mutate,
  };
}

// ============================================================================
// Hook to fetch all positions for a session
// ============================================================================

export function useSessionPositions(sessionId: string | null) {
  const result = usePositions({ sessionId: sessionId ?? "" });

  if (!sessionId) {
    return {
      positions: [] as DflowPosition[],
      isLoading: false,
      error: undefined,
      mutate: () => Promise.resolve(undefined),
    };
  }

  return result;
}
