"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { UIMessage } from "ai";
import { getCachedMessages, setCachedMessages } from "@/lib/cache/chat";
import type { ChatMessage } from "@/types/chat";

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

  // Chat transport
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => {
          return {
            body: {
              message: messages[messages.length - 1],
              sessionId: sessionIdRef.current,
            },
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
        // Try cache first
        const cached = getCachedMessages(sessionId);
        if (cached.length > 0) {
          setInitialMessages(cached as ChatMessage[]);
        }

        // Fetch from chat messages API
        const response = await fetch(
          `/api/arena/chat-messages?sessionId=${sessionId}`,
        );
        if (response.ok) {
          const messages = await response.json();
          setInitialMessages(messages);
          setCachedMessages(sessionId, messages);
        } else if (cached.length === 0) {
          // No cache and API failed - start fresh
          setInitialMessages([]);
        }

        hasLoadedRef.current = sessionId;
      } catch (err) {
        console.error("Failed to load messages:", err);
        setLocalError(
          err instanceof Error ? err : new Error("Failed to load messages"),
        );
        // Use cached if available
        const cached = getCachedMessages(sessionId);
        if (cached.length > 0) {
          setInitialMessages(cached as ChatMessage[]);
        }
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
