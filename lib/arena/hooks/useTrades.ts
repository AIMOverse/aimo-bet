"use client";

import useSWR from "swr";
import { fetchSessionTrades, fetchModels } from "../api";
import { POLLING_INTERVALS } from "../constants";
import type { Trade, TradeWithModel, ArenaModel } from "@/types/arena";

/**
 * Hook to fetch trades for a session with model info
 */
export function useTrades(sessionId: string | null, limit = 50) {
  // Fetch trades
  const {
    data: trades,
    error: tradesError,
    isLoading: tradesLoading,
    mutate: mutateTrades,
  } = useSWR<Trade[]>(
    sessionId ? `arena/trades/${sessionId}/${limit}` : null,
    () => (sessionId ? fetchSessionTrades(sessionId, limit) : []),
    {
      refreshInterval: POLLING_INTERVALS.trades,
    }
  );

  // Fetch models for enrichment
  const {
    data: models,
    error: modelsError,
    isLoading: modelsLoading,
  } = useSWR<ArenaModel[]>("arena/models", () => fetchModels(false), {
    revalidateOnFocus: false,
  });

  // Enrich trades with model info
  const tradesWithModels: TradeWithModel[] = (trades || []).map((trade) => {
    // Find model by matching portfolio -> we'd need portfolio-model mapping
    // For now, we'll need to extend the API to include model info
    const model = models?.find((m) => m.id === trade.portfolioId) || {
      id: trade.portfolioId,
      name: "Unknown Model",
      provider: "Unknown",
      modelIdentifier: "unknown",
      chartColor: "#6366f1",
      enabled: true,
      createdAt: new Date(),
    };
    return { ...trade, model };
  });

  return {
    trades: tradesWithModels,
    isLoading: tradesLoading || modelsLoading,
    error: tradesError || modelsError,
    mutate: mutateTrades,
  };
}
