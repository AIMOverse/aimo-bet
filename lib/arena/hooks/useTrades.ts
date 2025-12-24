"use client";

import useSWR from "swr";
import { POLLING_INTERVALS } from "../constants";
import { useArenaModels } from "./usePerformance";
import type { ArenaModel } from "@/types/arena";

// ============================================================================
// Types for dflow trades
// ============================================================================

export interface DflowTrade {
  id: string;
  market_ticker: string;
  wallet: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  quantity: number;
  price: number;
  total: number;
  timestamp: string;
  tx_signature?: string;
  // Enriched fields
  modelId?: string;
  modelName?: string;
  modelColor?: string;
}

export interface DflowTradeWithModel extends DflowTrade {
  model: ArenaModel;
}

// ============================================================================
// Fetch trades from dflow API
// ============================================================================

async function fetchDflowTrades(
  wallet: string,
  limit: number
): Promise<DflowTrade[]> {
  const response = await fetch(
    `/api/dflow/trades?wallet=${wallet}&limit=${limit}`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch trades");
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

// ============================================================================
// Hook to fetch trades for a session (from dflow)
// ============================================================================

interface UseTradesOptions {
  sessionId: string;
  modelId?: string;
  limit?: number;
}

export function useTrades({ sessionId, modelId, limit = 50 }: UseTradesOptions) {
  const { models } = useArenaModels();

  // Build wallet to model mapping
  const walletToModel = new Map<string, ArenaModel>();
  if (modelId) {
    const model = models?.find((m) => m.id === modelId);
    if (model?.walletAddress) {
      walletToModel.set(model.walletAddress, model);
    }
  } else {
    models?.forEach((m) => {
      if (m.walletAddress) {
        walletToModel.set(m.walletAddress, m);
      }
    });
  }

  const wallets = Array.from(walletToModel.keys());

  // Fetch trades from dflow for each wallet
  const { data, isLoading, error, mutate } = useSWR<DflowTradeWithModel[]>(
    wallets.length > 0 ? `dflow/trades/${wallets.join(",")}/${limit}` : null,
    async () => {
      const results = await Promise.all(
        wallets.map(async (wallet) => {
          const trades = await fetchDflowTrades(wallet, limit);
          const model = walletToModel.get(wallet);
          return trades.map((t) => ({
            ...t,
            modelId: model?.id,
            modelName: model?.name,
            modelColor: model?.chartColor,
            model: model || {
              id: "unknown",
              name: "Unknown Model",
              provider: "Unknown",
              modelIdentifier: "unknown",
              chartColor: "#6366f1",
              enabled: true,
              createdAt: new Date(),
            },
          }));
        })
      );

      // Merge and sort by timestamp (most recent first)
      return results
        .flat()
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, limit);
    },
    {
      refreshInterval: POLLING_INTERVALS.trades,
    }
  );

  return {
    trades: data || [],
    isLoading,
    error,
    mutate,
  };
}

// ============================================================================
// Legacy hook interface for backward compatibility
// ============================================================================

/**
 * @deprecated Use useTrades with sessionId and modelId instead
 */
export function useSessionTrades(sessionId: string | null, limit = 50) {
  if (!sessionId) {
    return {
      trades: [] as DflowTradeWithModel[],
      isLoading: false,
      error: null,
      mutate: () => Promise.resolve(),
    };
  }

  return useTrades({ sessionId, limit });
}
