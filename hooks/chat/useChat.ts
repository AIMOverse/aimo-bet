"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ChatMessage,
  TriggerType,
  DecisionType,
  PositionSide,
  TradeAction,
} from "@/lib/supabase/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { decisionToChatMessage } from "@/lib/supabase/transforms";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

/** Number of messages to fetch per page */
const PAGE_SIZE = 20;

interface UseChatOptions {
  /** Trading session ID */
  sessionId: string | null;
  /** Filter by model ID (optional) */
  modelId?: string | null;
}

interface UseChatReturn {
  /** All messages in the chat (filtered if modelId provided) */
  messages: ChatMessage[];
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether loading more messages */
  isLoadingMore: boolean;
  /** Whether there are more messages to load */
  hasMore: boolean;
  /** Error if any */
  error: Error | undefined;
  /** Load more older messages */
  loadMore: () => Promise<void>;
}

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

// ============================================================================
// Helper: Transform DB row to ChatMessage
// ============================================================================

function transformDecisionToMessage(
  data: DecisionQueryResult
): ChatMessage | null {
  const agentSessions = data.agent_sessions;
  const agentTrades = data.agent_trades || [];

  // Transform to AgentDecision
  const decision = {
    id: data.id,
    agentSessionId: data.agent_session_id,
    triggerType: data.trigger_type,
    triggerDetails: data.trigger_details ?? undefined,
    marketTicker: data.market_ticker ?? undefined,
    marketTitle: data.market_title ?? undefined,
    decision: data.decision,
    reasoning: data.reasoning,
    confidence: data.confidence ?? undefined,
    marketContext: data.market_context ?? undefined,
    portfolioValueAfter: data.portfolio_value_after,
    createdAt: new Date(data.created_at),
  };

  // Transform trades
  const trades = agentTrades.map((t) => ({
    id: t.id,
    decisionId: data.id,
    agentSessionId: data.agent_session_id,
    marketTicker: data.market_ticker || "",
    side: t.side,
    action: t.action,
    quantity: t.quantity,
    price: t.price,
    notional: t.notional,
    createdAt: new Date(data.created_at),
  }));

  // Transform to ChatMessage
  return decisionToChatMessage(
    decision,
    {
      sessionId: agentSessions.session_id,
      modelId: agentSessions.model_id,
      modelName: agentSessions.model_name,
    },
    trades
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useChat({
  sessionId,
  modelId = null,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  const hasLoadedRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Track oldest message for pagination
  const oldestTimestampRef = useRef<string | null>(null);

  /**
   * Fetch decisions from Supabase with optional pagination
   */
  const fetchDecisions = useCallback(
    async (
      client: ReturnType<typeof getSupabaseClient>,
      options: { before?: string; limit: number }
    ): Promise<{ data: DecisionQueryResult[]; hasMore: boolean }> => {
      if (!client || !sessionId) {
        return { data: [], hasMore: false };
      }

      let query = client
        .from("agent_decisions")
        .select(
          `
          *,
          agent_sessions!inner(session_id, model_id, model_name),
          agent_trades(id, side, action, quantity, price, notional)
        `
        )
        .eq("agent_sessions.session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(options.limit + 1); // Fetch one extra to check if there's more

      // Filter by model if specified
      if (modelId) {
        query = query.eq("agent_sessions.model_id", modelId);
      }

      // Pagination: fetch older than this timestamp
      if (options.before) {
        query = query.lt("created_at", options.before);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        throw new Error(`Failed to fetch decisions: ${queryError.message}`);
      }

      const results = (data || []) as unknown as DecisionQueryResult[];
      const hasMoreResults = results.length > options.limit;

      // Remove the extra item we fetched for pagination check
      if (hasMoreResults) {
        results.pop();
      }

      return { data: results, hasMore: hasMoreResults };
    },
    [sessionId, modelId]
  );

  /**
   * Load initial messages (most recent)
   */
  useEffect(() => {
    // Reset when session or model filter changes
    const cacheKey = `${sessionId}:${modelId}`;
    if (hasLoadedRef.current === cacheKey) {
      return;
    }

    if (!sessionId) {
      setMessages([]);
      setHasMore(false);
      hasLoadedRef.current = null;
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setError(new Error("Supabase client not configured"));
      return;
    }

    const loadInitial = async () => {
      setIsLoading(true);
      setError(undefined);
      setMessages([]);
      oldestTimestampRef.current = null;

      try {
        const { data, hasMore: more } = await fetchDecisions(client, {
          limit: PAGE_SIZE,
        });

        // Transform to ChatMessages (newest first)
        const chatMessages = data
          .map(transformDecisionToMessage)
          .filter((m): m is ChatMessage => m !== null);

        setMessages(chatMessages);
        setHasMore(more);

        // Track oldest timestamp for pagination
        if (data.length > 0) {
          oldestTimestampRef.current = data[data.length - 1].created_at;
        }

        hasLoadedRef.current = cacheKey;
      } catch (err) {
        console.error("[useChat] Failed to load messages:", err);
        setError(
          err instanceof Error ? err : new Error("Failed to load messages")
        );
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitial();
  }, [sessionId, modelId, fetchDecisions]);

  /**
   * Load more older messages
   */
  const loadMore = useCallback(async () => {
    if (
      !sessionId ||
      !hasMore ||
      isLoadingMore ||
      !oldestTimestampRef.current
    ) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    setIsLoadingMore(true);

    try {
      const { data, hasMore: more } = await fetchDecisions(client, {
        before: oldestTimestampRef.current,
        limit: PAGE_SIZE,
      });

      // Transform to ChatMessages (newest first within batch)
      const chatMessages = data
        .map(transformDecisionToMessage)
        .filter((m): m is ChatMessage => m !== null);

      // Append older messages (they go at the bottom)
      setMessages((prev) => [...prev, ...chatMessages]);
      setHasMore(more);

      // Update oldest timestamp
      if (data.length > 0) {
        oldestTimestampRef.current = data[data.length - 1].created_at;
      }
    } catch (err) {
      console.error("[useChat] Failed to load more messages:", err);
      setError(
        err instanceof Error ? err : new Error("Failed to load more messages")
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [sessionId, hasMore, isLoadingMore, fetchDecisions]);

  /**
   * Realtime subscription for new agent decisions
   */
  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) {
      console.warn("[useChat:realtime] Supabase client not configured");
      return;
    }

    console.log(
      `[useChat:realtime] Subscribing to decisions for session: ${sessionId}`
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
              `
              )
              .eq("id", payload.new.id)
              .single();

            if (data) {
              const typedData = data as unknown as DecisionQueryResult;
              const agentSessions = typedData.agent_sessions;

              // Only process if it's for our session
              if (agentSessions.session_id !== sessionId) {
                return;
              }

              // Filter by model if specified
              if (modelId && agentSessions.model_id !== modelId) {
                return;
              }

              const chatMessage = transformDecisionToMessage(typedData);
              if (!chatMessage) return;

              console.log(
                `[useChat:realtime] New decision from ${agentSessions.model_id}: ${typedData.decision}`
              );

              // Add new message at the top (dedupe check)
              setMessages((prev) => {
                if (prev.some((m) => m.id === chatMessage.id)) {
                  return prev;
                }
                return [chatMessage, ...prev];
              });
            }
          } catch (err) {
            console.error("[useChat:realtime] Error processing decision:", err);
          }
        }
      )
      .subscribe((status) => {
        console.log(`[useChat:realtime] Subscription status: ${status}`);
      });

    channelRef.current = channel;

    return () => {
      console.log(
        `[useChat:realtime] Unsubscribing from session: ${sessionId}`
      );
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId, modelId]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  };
}
