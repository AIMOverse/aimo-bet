"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@/lib/ai/workflows/workflowTransport";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { UIMessage } from "ai";
import type { ChatMessage } from "@/lib/supabase/types";
import { useRealtimeMessages } from "./useRealtimeMessages";

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

export function useChat({ sessionId }: UseChatOptions): UseChatReturn {
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<Error | undefined>(undefined);

  const hasLoadedRef = useRef<string | null>(null);

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

  // Realtime: receive agent trade broadcasts instantly
  const handleRealtimeMessage = useCallback(
    (message: ChatMessage) => {
      // Only append messages from agents (not our own or duplicates)
      if (message.metadata?.authorType === "model") {
        setMessages((prev) => {
          // Dedupe check
          if (prev.some((m) => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
      }
    },
    [setMessages],
  );

  useRealtimeMessages({
    sessionId,
    onMessage: handleRealtimeMessage,
  });

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
