"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MODELS } from "@/lib/ai/models";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export interface AgentTrade {
  id: string;
  marketTicker: string;
  marketTitle?: string;
  platform: "kalshi" | "polymarket";
  side: "yes" | "no";
  action: "buy" | "sell" | "redeem";
  quantity: number;
  price: number;
  notional: number;
  txSignature?: string;
  createdAt: Date;
  // Enriched
  modelId?: string;
  modelName?: string;
  modelColor?: string;
  modelSeries?: string;
}

interface UseTradesOptions {
  sessionId: string;
  modelId?: string;
  limit?: number;
}

// ============================================================================
// Hook
// ============================================================================

export function useTrades({
  sessionId,
  modelId,
  limit = 50,
}: UseTradesOptions) {
  const [trades, setTrades] = useState<AgentTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Load initial trades
  const loadTrades = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !sessionId) return;

    setIsLoading(true);
    try {
      let query = client
        .from("agent_trades")
        .select(
          `
          *,
          agent_sessions!inner(session_id, model_id, model_name)
        `,
        )
        .eq("agent_sessions.session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (modelId) {
        query = query.eq("agent_sessions.model_id", modelId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setTrades((data || []).map(mapTradeRow));
      setError(undefined);
    } catch (err) {
      console.error("[useTrades] Failed to fetch:", err);
      setError(
        err instanceof Error ? err : new Error("Failed to fetch trades"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, modelId, limit]);

  // Initial load
  useEffect(() => {
    if (sessionId) loadTrades();
  }, [sessionId, loadTrades]);

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) return;

    console.log(`[useTrades] Subscribing to trades for session: ${sessionId}`);

    const channel = client
      .channel(`trades:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_trades",
        },
        async (payload) => {
          // Fetch full trade with agent info
          const { data } = await client
            .from("agent_trades")
            .select(
              `
              *,
              agent_sessions!inner(session_id, model_id, model_name)
            `,
            )
            .eq("id", payload.new.id)
            .single();

          if (data) {
            const row = data as Record<string, unknown>;
            const agentSession = row.agent_sessions as {
              session_id: string;
              model_id: string;
              model_name: string;
            };

            // Only add if matches our session (and optionally model)
            if (agentSession.session_id === sessionId) {
              if (!modelId || agentSession.model_id === modelId) {
                const trade = mapTradeRow(row);
                setTrades((prev) => {
                  // Dedupe
                  if (prev.some((t) => t.id === trade.id)) return prev;
                  return [trade, ...prev].slice(0, limit);
                });
              }
            }
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      console.log(`[useTrades] Unsubscribing from session: ${sessionId}`);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId, modelId, limit]);

  return {
    trades,
    isLoading,
    error,
    mutate: loadTrades,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function mapTradeRow(row: Record<string, unknown>): AgentTrade {
  const agentSession = row.agent_sessions as {
    model_id: string;
    model_name: string;
  };
  const model = MODELS.find((m) => m.id === agentSession.model_id);

  return {
    id: row.id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: (row.market_title as string) ?? undefined,
    platform: (row.platform as "kalshi" | "polymarket") ?? "kalshi",
    side: row.side as "yes" | "no",
    action: row.action as "buy" | "sell" | "redeem",
    quantity: row.quantity as number,
    price: row.price as number,
    notional: row.notional as number,
    txSignature: (row.tx_signature as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
    modelId: agentSession.model_id,
    modelName: model?.name || agentSession.model_name,
    modelColor: model?.chartColor,
    modelSeries: model?.series,
  };
}

// ============================================================================
// Session Trades Hook
// ============================================================================

export function useSessionTrades(sessionId: string | null, limit = 50) {
  const result = useTrades({ sessionId: sessionId ?? "", limit });

  if (!sessionId) {
    return {
      trades: [] as AgentTrade[],
      isLoading: false,
      error: undefined,
      mutate: () => Promise.resolve(),
    };
  }

  return result;
}
