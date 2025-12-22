"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { UIMessage, FileUIPart } from "ai";
import { useChatStore } from "@/store/chatStore";
import { useModelStore } from "@/store/modelStore";
import { useToolStore } from "@/store/toolStore";
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
  /** Send a message with optional file attachments */
  sendMessage: (content: string, files?: FileUIPart[]) => Promise<void>;
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
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [input, setInput] = useState("");

  // Generate a stable ID for new chats to ensure we always use a UUID
  // This prevents the AI SDK from generating non-UUID IDs (nanoid)
  const [generatedSessionId] = useState(() => crypto.randomUUID());

  // For new chats, generate a session ID client-side (UUIDs are collision-safe)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    sessionId,
  );

  // The effective session ID to use for the chat instance
  const activeSessionId = currentSessionId ?? generatedSessionId;

  const hasLoadedRef = useRef<string | null>(null);
  const isNewChatRef = useRef(sessionId === null);
  const shouldRefreshOnFinishRef = useRef(false);

  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const { generateImageEnabled, generateVideoEnabled, webSearchEnabled } =
    useToolStore.getState();
  const setIsGenerating = useChatStore((s) => s.setIsGenerating);
  const setStoreError = useChatStore((s) => s.setError);
  const setStoreCurrentSession = useChatStore((s) => s.setCurrentSession);
  const triggerSessionRefresh = useChatStore((s) => s.triggerSessionRefresh);

  // Send only the last message to the server (server loads history from DB)
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, id }) => ({
          body: {
            message: messages[messages.length - 1],
            // Use the ID passed from useChat, which matches activeSessionId
            sessionId: id,
            model: selectedModelId,
            tools: {
              generateImage: generateImageEnabled,
              generateVideo: generateVideoEnabled,
              webSearch: webSearchEnabled,
            },
          },
        }),
      }),
    [
      selectedModelId,
      generateImageEnabled,
      generateVideoEnabled,
      webSearchEnabled,
    ],
  );

  // Load messages when session changes
  useEffect(() => {
    // Skip loading if:
    // - No session ID (new chat)
    // - Already loaded this session
    if (!sessionId || hasLoadedRef.current === sessionId) {
      return;
    }

    const loadMessages = async () => {
      setIsLoadingHistory(true);
      try {
        // Try cache first for faster load
        const cached = getCachedMessages(sessionId);
        if (cached.length > 0) {
          setInitialMessages(cached);
        }

        // Fetch fresh from API
        const response = await fetch(`/api/sessions/messages?id=${sessionId}`);
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

  // Reset when session changes (e.g., navigating to a different session via sidebar)
  useEffect(() => {
    if (!sessionId) {
      // Starting a new chat - reset everything
      setInitialMessages([]);
      hasLoadedRef.current = null;
      setCurrentSessionId(null);
      isNewChatRef.current = true;
    } else if (sessionId !== currentSessionId) {
      // Navigating to a different existing session - load from DB
      setCurrentSessionId(sessionId);
      isNewChatRef.current = false;
    }
  }, [sessionId, currentSessionId]);

  const {
    messages,
    status,
    error,
    sendMessage: aiSendMessage,
    stop,
    regenerate,
    setMessages,
  } = useAIChat({
    // Always provide a UUID
    id: activeSessionId,
    messages: initialMessages,
    transport,
    onFinish: async () => {
      setIsGenerating(false);
      // Refresh session list if this was a new chat (to show AI-generated title)
      if (shouldRefreshOnFinishRef.current) {
        shouldRefreshOnFinishRef.current = false;
        triggerSessionRefresh();
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

  // Update messages when initial messages are loaded from DB
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  const sendMessage = useCallback(
    async (content: string, files?: FileUIPart[]) => {
      const hasText = content.trim().length > 0;
      const hasFiles = files && files.length > 0;

      if (!hasText && !hasFiles) return;

      // For new chats, update the URL without causing a navigation/remount
      if (isNewChatRef.current && !currentSessionId) {
        // Use the ID that useAIChat is already configured with
        const newSessionId = activeSessionId;
        setCurrentSessionId(newSessionId);
        setStoreCurrentSession(newSessionId);
        isNewChatRef.current = false;

        // Mark that we need to refresh sessions after first message completes
        // This ensures the AI-generated title appears in the sidebar
        shouldRefreshOnFinishRef.current = true;

        // Update URL without triggering navigation (no remount, preserves state)
        window.history.replaceState(null, "", `/chat/${newSessionId}`);
      }

      // Build message parts
      const parts: UIMessage["parts"] = [];

      // Add file parts first (images appear before text)
      if (hasFiles) {
        for (const file of files) {
          parts.push(file);
        }
      }

      // Add text part
      if (hasText) {
        parts.push({ type: "text", text: content });
      }

      // Send to AI using the AI SDK sendMessage
      // The message will be persisted server-side
      aiSendMessage({ parts });
    },
    [aiSendMessage, currentSessionId, setStoreCurrentSession, activeSessionId],
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
