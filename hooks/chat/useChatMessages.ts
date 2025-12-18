"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { UIMessage } from "ai";
import { useChatStore } from "@/store/chatStore";
import { useModelStore } from "@/store/modelStore";
import { useToolStore } from "@/store/toolStore";
import { useSessionStore } from "@/store/sessionStore";
import { getCachedMessages, setCachedMessages } from "@/lib/cache/messages";

interface UseChatMessagesOptions {
  /** Session ID to load messages for (null for new chat) */
  sessionId: string | null;
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
}: UseChatMessagesOptions): UseChatMessagesReturn {
  const router = useRouter();
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [input, setInput] = useState("");
  // For new chats, generate a session ID client-side (UUIDs are collision-safe)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    sessionId
  );
  const hasLoadedRef = useRef<string | null>(null);
  const isNewChatRef = useRef(sessionId === null);

  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const globalEnabledTools = useToolStore((s) => s.globalEnabledTools);
  const setIsGenerating = useChatStore((s) => s.setIsGenerating);
  const setStoreError = useChatStore((s) => s.setError);
  const setStoreCurrentSession = useSessionStore((s) => s.setCurrentSession);

  // Create transport that sends only the last message
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Only send the last message to reduce payload size
        // Server will load previous messages from Supabase
        prepareSendMessagesRequest({ messages }) {
          const lastMessage = messages[messages.length - 1];
          return {
            body: {
              message: {
                role: lastMessage.role,
                parts: lastMessage.parts,
              },
              sessionId: currentSessionId,
              model: selectedModelId,
              enabledTools: globalEnabledTools,
            },
          };
        },
      }),
    [currentSessionId, selectedModelId, globalEnabledTools]
  );

  // Load messages when session changes
  useEffect(() => {
    if (!sessionId || hasLoadedRef.current === sessionId) return;

    const loadMessages = async () => {
      setIsLoadingHistory(true);
      try {
        // Try cache first for faster load
        const cached = getCachedMessages(sessionId);
        if (cached.length > 0) {
          setInitialMessages(cached);
        }

        // Fetch fresh from API
        const response = await fetch(
          `/api/sessions/messages?id=${sessionId}`
        );
        if (response.ok) {
          const messages = await response.json();
          setInitialMessages(messages);
          // Update cache
          setCachedMessages(sessionId, messages);
        } else if (cached.length === 0) {
          // No cache and API failed - start fresh
          setInitialMessages([]);
        }

        hasLoadedRef.current = sessionId;
      } catch (err) {
        console.error("Failed to load messages:", err);
        // Use cached messages if available
        const cached = getCachedMessages(sessionId);
        if (cached.length > 0) {
          setInitialMessages(cached);
        }
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadMessages();
  }, [sessionId]);

  // Reset when session changes
  useEffect(() => {
    if (!sessionId) {
      setInitialMessages([]);
      hasLoadedRef.current = null;
      setCurrentSessionId(null);
      isNewChatRef.current = true;
    } else {
      setCurrentSessionId(sessionId);
      isNewChatRef.current = false;
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
    id: currentSessionId ?? undefined,
    messages: initialMessages,
    transport,
    onFinish: async () => {
      setIsGenerating(false);
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

      // For new chats, generate a session ID and navigate
      if (isNewChatRef.current && !currentSessionId) {
        const newSessionId = crypto.randomUUID();
        setCurrentSessionId(newSessionId);
        setStoreCurrentSession(newSessionId);
        isNewChatRef.current = false;

        // Navigate to the new session URL
        router.push(`/chat/${newSessionId}`);
      }

      // Send to AI using the AI SDK sendMessage
      // The message will be persisted server-side
      aiSendMessage({ parts: [{ type: "text", text: content }] });
    },
    [aiSendMessage, currentSessionId, router, setStoreCurrentSession]
  );

  // Append message locally (for manual additions)
  const append = useCallback(
    (message: UIMessage) => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages]
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
