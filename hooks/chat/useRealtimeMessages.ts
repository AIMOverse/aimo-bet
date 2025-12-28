"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ChatMessage,
  TriggerType,
  DecisionType,
  PositionSide,
  TradeAction,
} from "@/lib/supabase/types";
import { decisionToChatMessage } from "@/lib/supabase/transforms";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Query result type for agent_decisions with joined agent_sessions and agent_trades
 */
interface DecisionQueryResult {
  id: string;
  agent_session_id: string;
  trigger_type: TriggerType;
  trigger_details: Record<string, unknown> | null;
  market_ticker: string | null;
  market_title: string | null;
  decision: DecisionType;
  reasoning: string;
  confidence: number | null;
  market_context: Record<string, unknown> | null;
  portfolio_value_after: number;
  created_at: string;
  agent_sessions: {
    session_id: string;
    model_id: string;
    model_name: string;
  };
  agent_trades: Array<{
    id: string;
    side: PositionSide;
    action: TradeAction;
    quantity: number;
    price: number;
    notional: number;
  }>;
}

interface UseRealtimeMessagesOptions {
  /** Trading session ID to subscribe to */
  sessionId: string | null;
  /** Callback when a new message arrives */
  onMessage: (message: ChatMessage) => void;
}

/**
 * Subscribe to realtime agent decisions for a session.
 * Transforms decisions into ChatMessage format for the existing chat UI.
 */
export function useRealtimeMessages({
  sessionId,
  onMessage,
}: UseRealtimeMessagesOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep callback ref updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) {
      console.warn("[realtime:chat] Supabase client not configured");
      return;
    }

    console.log(
      `[realtime:chat] Subscribing to decisions for session: ${sessionId}`,
    );

    const channel = client
      .channel(`decisions:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_decisions",
        },
        async (payload) => {
          try {
            // Fetch the full decision with agent info and trades
            const { data } = await client
              .from("agent_decisions")
              .select(
                `
                *,
                agent_sessions!inner(session_id, model_id, model_name),
                agent_trades(id, side, action, quantity, price, notional)
              `,
              )
              .eq("id", payload.new.id)
              .single();

            if (data) {
              const typedData = data as unknown as DecisionQueryResult;
              const agentSessions = typedData.agent_sessions;

              // Only process if it's for our session
              if (agentSessions.session_id === sessionId) {
                const agentTrades = typedData.agent_trades || [];

                // Transform to AgentDecision
                const decision = {
                  id: typedData.id,
                  agentSessionId: typedData.agent_session_id,
                  triggerType: typedData.trigger_type,
                  triggerDetails: typedData.trigger_details ?? undefined,
                  marketTicker: typedData.market_ticker ?? undefined,
                  marketTitle: typedData.market_title ?? undefined,
                  decision: typedData.decision,
                  reasoning: typedData.reasoning,
                  confidence: typedData.confidence ?? undefined,
                  marketContext: typedData.market_context ?? undefined,
                  portfolioValueAfter: typedData.portfolio_value_after,
                  createdAt: new Date(typedData.created_at),
                };

                // Transform trades
                const trades = agentTrades.map((t) => ({
                  id: t.id,
                  decisionId: typedData.id,
                  agentSessionId: typedData.agent_session_id,
                  marketTicker: typedData.market_ticker || "",
                  side: t.side,
                  action: t.action,
                  quantity: t.quantity,
                  price: t.price,
                  notional: t.notional,
                  createdAt: new Date(typedData.created_at),
                }));

                // Transform snake_case to camelCase for decisionToChatMessage
                const chatMessage = decisionToChatMessage(
                  decision,
                  {
                    sessionId: agentSessions.session_id,
                    modelId: agentSessions.model_id,
                    modelName: agentSessions.model_name,
                  },
                  trades,
                );

                console.log(
                  `[realtime:chat] New decision from ${agentSessions.model_id}: ${decision.decision}`,
                );
                onMessageRef.current(chatMessage);
              }
            }
          } catch (error) {
            console.error("[realtime:chat] Error processing decision:", error);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_trades",
        },
        async () => {
          // Trade inserted - trades are included when decision is fetched
          // Could update existing message if needed
        },
      )
      .subscribe((status) => {
        console.log(`[realtime:chat] Subscription status: ${status}`);
      });

    channelRef.current = channel;

    return () => {
      console.log(`[realtime:chat] Unsubscribing from session: ${sessionId}`);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId]);
}
