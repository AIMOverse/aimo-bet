"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { UIMessage } from "ai";
import type { AppUIMessage } from "@/types/chat";
import { toUIMessage } from "@/types/chat";
import { getStorageAdapter } from "@/lib/storage";
import { useChatStore } from "@/store/chatStore";
import { useModelStore } from "@/store/modelStore";

interface UseChatMessagesOptions {
  /** Session ID to load messages for */
  sessionId: string | null;
  /** Callback when a new session should be created */
  onCreateSession?: () => Promise<string>;
}

interface UseChatMessagesReturn {
  /** All messages in the chat */
  messages: UIMessage[];
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
  /** Reload last message */
  reload: () => void;
  /** Append a message without sending */
  append: (message: UIMessage) => void;
}

export function useChatMessages({
  sessionId,
  onCreateSession,
}: UseChatMessagesOptions): UseChatMessagesReturn {
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [input, setInput] = useState("");
  const hasLoadedRef = useRef<string | null>(null);

  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setIsGenerating = useChatStore((s) => s.setIsGenerating);
  const setStoreError = useChatStore((s) => s.setError);

  const storage = getStorageAdapter();

  // Create transport with model in body
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {
          model: selectedModelId,
          sessionId,
        },
      }),
    [selectedModelId, sessionId],
  );

  // Load messages when session changes
  useEffect(() => {
    if (!sessionId || hasLoadedRef.current === sessionId) return;

    const loadMessages = async () => {
      setIsLoadingHistory(true);
      try {
        const persisted = await storage.getMessages(sessionId);
        const uiMessages = persisted.map(toUIMessage);
        setInitialMessages(uiMessages);
        hasLoadedRef.current = sessionId;
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadMessages();
  }, [sessionId, storage]);

  // Reset when session changes
  useEffect(() => {
    if (!sessionId) {
      setInitialMessages([]);
      hasLoadedRef.current = null;
    }
  }, [sessionId]);

  const {
    messages,
    status,
    error,
    sendMessage: aiSendMessage,
    stop,
    regenerate,
    setMessages,
  } = useAIChat({
    id: sessionId ?? undefined,
    messages: initialMessages,
    transport,
    onFinish: async ({ message }) => {
      setIsGenerating(false);

      // Persist assistant message
      if (sessionId && message) {
        try {
          await storage.addMessage(
            sessionId,
            message as AppUIMessage,
            selectedModelId,
          );
        } catch (err) {
          console.error("Failed to persist message:", err);
        }
      }
    },
    onError: (err) => {
      setIsGenerating(false);
      setStoreError(err.message);
    },
  });

  // Track streaming state
  useEffect(() => {
    if (status === "streaming") {
      setIsGenerating(true);
    } else if (status === "ready" || status === "error") {
      setIsGenerating(false);
    }
  }, [status, setIsGenerating]);

  // Update messages when initial messages are loaded
  useEffect(() => {
    if (initialMessages.length > 0 && hasLoadedRef.current === sessionId) {
      setMessages(initialMessages);
    }
  }, [initialMessages, sessionId, setMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      let activeSessionId = sessionId;

      // Create session if needed
      if (!activeSessionId && onCreateSession) {
        activeSessionId = await onCreateSession();
      }

      if (!activeSessionId) {
        setStoreError("No active session");
        return;
      }

      // Persist user message
      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: content }],
      };

      try {
        await storage.addMessage(activeSessionId, userMessage as AppUIMessage);
      } catch (err) {
        console.error("Failed to persist user message:", err);
      }

      // Send to AI using the AI SDK sendMessage
      aiSendMessage({ parts: [{ type: "text", text: content }] });
    },
    [sessionId, onCreateSession, storage, aiSendMessage, setStoreError],
  );

  // Append message locally (for manual additions)
  const append = useCallback(
    (message: UIMessage) => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages],
  );

  const isLoading =
    status === "streaming" || status === "submitted" || isLoadingHistory;

  return {
    messages: isLoadingHistory ? [] : messages,
    input,
    setInput,
    isLoading,
    error,
    sendMessage,
    stop,
    reload: regenerate,
    append,
  };
}
