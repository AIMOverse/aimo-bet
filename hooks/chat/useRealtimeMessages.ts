"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/supabase/types";
import { decisionToChatMessage } from "@/lib/supabase/transforms";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

    console.log(`[realtime:chat] Subscribing to decisions for session: ${sessionId}`);

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
              `
              )
              .eq("id", payload.new.id)
              .single();

            if (data) {
              const agentSessions = data.agent_sessions as {
                session_id: string;
                model_id: string;
                model_name: string;
              };

              // Only process if it's for our session
              if (agentSessions.session_id === sessionId) {
                const agentTrades = (data.agent_trades as Array<{
                  id: string;
                  side: "yes" | "no";
                  action: "buy" | "sell";
                  quantity: number;
                  price: number;
                  notional: number;
                }>) || [];

                // Transform to AgentDecision
                const decision = {
                  id: data.id as string,
                  agentSessionId: data.agent_session_id as string,
                  triggerType: data.trigger_type as "price_swing" | "volume_spike" | "orderbook_imbalance" | "periodic" | "manual",
                  triggerDetails: (data.trigger_details as Record<string, unknown>) ?? undefined,
                  marketTicker: (data.market_ticker as string) ?? undefined,
                  marketTitle: (data.market_title as string) ?? undefined,
                  decision: data.decision as "buy" | "sell" | "hold" | "skip",
                  reasoning: data.reasoning as string,
                  confidence: (data.confidence as number) ?? undefined,
                  marketContext: (data.market_context as Record<string, unknown>) ?? undefined,
                  portfolioValueAfter: data.portfolio_value_after as number,
                  createdAt: new Date(data.created_at as string),
                };

                // Transform trades
                const trades = agentTrades.map((t) => ({
                  id: t.id,
                  decisionId: data.id as string,
                  agentSessionId: data.agent_session_id as string,
                  marketTicker: (data.market_ticker as string) || "",
                  side: t.side as "yes" | "no",
                  action: t.action as "buy" | "sell",
                  quantity: t.quantity,
                  price: t.price,
                  notional: t.notional,
                  createdAt: new Date(data.created_at as string),
                }));

                const chatMessage = decisionToChatMessage(
                  decision,
                  agentSessions,
                  trades
                );

                console.log(
                  `[realtime:chat] New decision from ${agentSessions.model_id}: ${decision.decision}`
                );
                onMessageRef.current(chatMessage);
              }
            }
          } catch (error) {
            console.error("[realtime:chat] Error processing decision:", error);
          }
        }
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
        }
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
