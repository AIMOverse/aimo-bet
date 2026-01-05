"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@/lib/ai/workflows/workflowTransport";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { UIMessage } from "ai";
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

interface UseChatOptions {
  /** Trading session ID */
  sessionId: string | null;
}

interface UseChatReturn {
  /** All messages in the chat */
  messages: ChatMessage[];
  /** Input value (managed locally) */
  input: string;
  /** Set input value */
  setInput: (value: string) => void;
  /** Whether the AI is generating */
  isLoading: boolean;
  /** Error if any */
  error: Error | undefined;
  /** Send a message */
  sendMessage: (content: string) => Promise<void>;
  /** Stop generation */
  stop: () => void;
  /** Append a message without sending (for model broadcasts) */
  append: (message: ChatMessage) => void;
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
// Hook
// ============================================================================

export function useChat({ sessionId }: UseChatOptions): UseChatReturn {
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<Error | undefined>(undefined);

  const hasLoadedRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Ref for session ID to use in transport (read at request time)
  const sessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Stable internal ID for useAIChat
  const internalChatId = useMemo(
    () => `chat-${sessionId ?? "none"}`,
    [sessionId],
  );

  // WorkflowChatTransport for resumable streams
  const transport = useMemo(
    () =>
      new WorkflowChatTransport({
        api: "/api/chat",
        onChatSendMessage: (response) => {
          // Track workflow run ID from response headers for resumability
          const runId = response.headers.get("x-workflow-run-id");
          if (runId) {
            console.log(`[useChat] Workflow run ID: ${runId}`);
          }
        },
        prepareSendMessagesRequest: ({ messages }) => {
          return {
            body: {
              message: messages[messages.length - 1],
              sessionId: sessionIdRef.current,
            },
          };
        },
        prepareReconnectToStreamRequest: ({ id }) => {
          // Enable stream resumption on reconnect
          return {
            api: `/api/chat?runId=${id}`,
          };
        },
      }),
    [],
  );

  // Load messages when session changes
  useEffect(() => {
    if (!sessionId || hasLoadedRef.current === sessionId) {
      return;
    }

    const loadMessages = async () => {
      setIsLoadingHistory(true);
      setLocalError(undefined);

      try {
        // Use the unified /api/chat endpoint with sessionId param
        const response = await fetch(`/api/chat?sessionId=${sessionId}`);
        if (response.ok) {
          const messages = await response.json();
          setInitialMessages(messages);
        } else {
          setInitialMessages([]);
        }

        hasLoadedRef.current = sessionId;
      } catch (err) {
        console.error("Failed to load messages:", err);
        setLocalError(
          err instanceof Error ? err : new Error("Failed to load messages"),
        );
        setInitialMessages([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadMessages();
  }, [sessionId]);

  // Reset when session changes
  useEffect(() => {
    if (sessionId !== hasLoadedRef.current) {
      setInitialMessages([]);
      hasLoadedRef.current = null;
    }
  }, [sessionId]);

  const {
    messages,
    status,
    error: chatError,
    sendMessage: aiSendMessage,
    stop,
    setMessages,
  } = useAIChat({
    id: internalChatId,
    messages: initialMessages,
    transport,
    onError: (err) => {
      setLocalError(err);
    },
  });

  // Sync initial messages to useAIChat when they load
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessagesRef.current(initialMessages);
    }
  }, [initialMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !sessionId) return;

      const parts: UIMessage["parts"] = [{ type: "text", text: content }];
      aiSendMessage({ parts });
    },
    [aiSendMessage, sessionId],
  );

  // Append message locally (for model broadcasts via realtime)
  const append = useCallback(
    (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages],
  );

  // Realtime subscription for agent decisions
  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) {
      console.warn("[useChat:realtime] Supabase client not configured");
      return;
    }

    console.log(
      `[useChat:realtime] Subscribing to decisions for session: ${sessionId}`,
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

                // Transform to ChatMessage
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
                  `[useChat:realtime] New decision from ${agentSessions.model_id}: ${decision.decision}`,
                );

                // Add to messages (dedupe check)
                setMessagesRef.current((prev) => {
                  if (prev.some((m) => m.id === chatMessage.id)) {
                    return prev;
                  }
                  return [...prev, chatMessage];
                });
              }
            }
          } catch (error) {
            console.error(
              "[useChat:realtime] Error processing decision:",
              error,
            );
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
        console.log(`[useChat:realtime] Subscription status: ${status}`);
      });

    channelRef.current = channel;

    return () => {
      console.log(
        `[useChat:realtime] Unsubscribing from session: ${sessionId}`,
      );
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId]);

  const isLoading =
    status === "streaming" || status === "submitted" || isLoadingHistory;

  return {
    messages: isLoadingHistory ? [] : (messages as ChatMessage[]),
    input,
    setInput,
    isLoading,
    error: chatError || localError,
    sendMessage,
    stop,
    append,
  };
}
