"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MODELS } from "@/lib/ai/models";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export interface AgentPosition {
  id: string;
  marketTicker: string;
  marketTitle?: string;
  side: "yes" | "no";
  mint: string;
  quantity: number;
  // Enriched
  modelId?: string;
  modelName?: string;
  modelColor?: string;
  modelSeries?: string;
}

interface UsePositionsOptions {
  sessionId: string;
  modelId?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function usePositions({ sessionId, modelId }: UsePositionsOptions) {
  const [positions, setPositions] = useState<AgentPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Load initial positions
  const loadPositions = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !sessionId) return;

    setIsLoading(true);
    try {
      let query = client
        .from("agent_positions")
        .select(
          `
          *,
          agent_sessions!inner(session_id, model_id, model_name)
        `,
        )
        .eq("agent_sessions.session_id", sessionId)
        .gt("quantity", 0)
        .order("updated_at", { ascending: false });

      if (modelId) {
        query = query.eq("agent_sessions.model_id", modelId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setPositions((data || []).map(mapPositionRow));
      setError(undefined);
    } catch (err) {
      console.error("[usePositions] Failed to fetch:", err);
      setError(
        err instanceof Error ? err : new Error("Failed to fetch positions"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, modelId]);

  // Initial load
  useEffect(() => {
    if (sessionId) loadPositions();
  }, [sessionId, loadPositions]);

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) return;

    console.log(
      `[usePositions] Subscribing to positions for session: ${sessionId}`,
    );

    const channel = client
      .channel(`positions:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "agent_positions",
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            // Remove deleted position
            const oldId = (payload.old as { id: string }).id;
            setPositions((prev) => prev.filter((p) => p.id !== oldId));
            return;
          }

          // INSERT or UPDATE - fetch full record with agent info
          const { data } = await client
            .from("agent_positions")
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

            // Only process if matches our session (and optionally model)
            if (agentSession.session_id === sessionId) {
              if (!modelId || agentSession.model_id === modelId) {
                const position = mapPositionRow(row);

                setPositions((prev) => {
                  // Remove if quantity is 0
                  if (position.quantity <= 0) {
                    return prev.filter((p) => p.id !== position.id);
                  }

                  // Update existing or add new
                  const exists = prev.some((p) => p.id === position.id);
                  if (exists) {
                    return prev.map((p) =>
                      p.id === position.id ? position : p,
                    );
                  }
                  return [position, ...prev];
                });
              }
            }
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      console.log(`[usePositions] Unsubscribing from session: ${sessionId}`);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId, modelId]);

  return {
    positions,
    isLoading,
    error,
    mutate: loadPositions,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function mapPositionRow(row: Record<string, unknown>): AgentPosition {
  const agentSession = row.agent_sessions as {
    model_id: string;
    model_name: string;
  };
  const model = MODELS.find((m) => m.id === agentSession.model_id);

  return {
    id: row.id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: (row.market_title as string) ?? undefined,
    side: row.side as "yes" | "no",
    mint: row.mint as string,
    quantity: row.quantity as number,
    modelId: agentSession.model_id,
    modelName: model?.name || agentSession.model_name,
    modelColor: model?.chartColor,
    modelSeries: model?.series,
  };
}

// ============================================================================
// Session Positions Hook
// ============================================================================

export function useSessionPositions(sessionId: string | null) {
  const result = usePositions({ sessionId: sessionId ?? "" });

  if (!sessionId) {
    return {
      positions: [] as AgentPosition[],
      isLoading: false,
      error: undefined,
      mutate: () => Promise.resolve(),
    };
  }

  return result;
}
