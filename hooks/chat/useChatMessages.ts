"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { UIMessage, FileUIPart } from "ai";
import { useChatStore } from "@/store/chatStore";
import { DEFAULT_MODEL_ID } from "@/config/defaults";
import { getCachedMessages, setCachedMessages } from "@/lib/cache/messages";

interface UseChatMessagesOptions {
  /** Session ID to load messages for (null for new chat) */
  sessionId: string | null;
}

interface UseChatMessagesReturn {
  /** All messages in the chat */
  messages: UIMessage[];
  /** Current session ID (may differ from prop after first message in new chat) */
  currentSessionId: string | null;
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

  // Get newChatCounter from store to detect when user explicitly requests a new chat
  const newChatCounter = useChatStore((s) => s.newChatCounter);

  // Stable internal ID for useAIChat - regenerated when:
  // 1. sessionId prop changes (navigating between sessions)
  // 2. newChatCounter changes (user clicks "New Chat")
  // This prevents useAIChat from resetting when currentSessionId updates from server
  const internalChatId = useMemo(
    () => sessionId ?? crypto.randomUUID(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, newChatCounter],
  );

  // Session ID for persistence - server is the single source of truth for new sessions
  // This may differ from internalChatId (server-generated vs client-generated)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    sessionId,
  );

  const hasLoadedRef = useRef<string | null>(null);
  const isNewChatRef = useRef(sessionId === null);
  const shouldRefreshOnFinishRef = useRef(false);
  // Track when we need to clear messages (navigating to new chat)
  const pendingClearRef = useRef(false);
  // Counter to force sync effect to run when navigating to new chat
  const [syncTrigger, setSyncTrigger] = useState(0);
  // Ref for session update callback (avoids stale closure in fetch wrapper)
  const sessionUpdateRef = useRef<(sessionId: string) => void>(() => {});

  // Use default model - user selection removed
  const selectedModelId = DEFAULT_MODEL_ID;
  // Tools always enabled by default
  const generateImageEnabled = true;
  const generateVideoEnabled = true;
  const webSearchEnabled = true;

  // Refs for dynamic values used in transport (read at request time, not transport creation)
  // This keeps the transport stable and prevents useAIChat from resetting
  const currentSessionIdRef = useRef<string | null>(currentSessionId);
  const selectedModelIdRef = useRef(selectedModelId);
  const toolSettingsRef = useRef({
    generateImageEnabled,
    generateVideoEnabled,
    webSearchEnabled,
  });

  // Keep refs updated when values change
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    selectedModelIdRef.current = selectedModelId;
  }, [selectedModelId]);

  useEffect(() => {
    toolSettingsRef.current = {
      generateImageEnabled,
      generateVideoEnabled,
      webSearchEnabled,
    };
  }, [generateImageEnabled, generateVideoEnabled, webSearchEnabled]);

  const setIsGenerating = useChatStore((s) => s.setIsGenerating);
  const setStoreError = useChatStore((s) => s.setError);
  const setStoreCurrentSession = useChatStore((s) => s.setCurrentSession);
  const triggerSessionRefresh = useChatStore((s) => s.triggerSessionRefresh);

  // Update sessionUpdateRef when dependencies change
  sessionUpdateRef.current = (newSessionId: string) => {
    if (!currentSessionId && isNewChatRef.current) {
      setCurrentSessionId(newSessionId);
      setStoreCurrentSession(newSessionId);
      isNewChatRef.current = false;
      shouldRefreshOnFinishRef.current = true;
      window.history.replaceState(null, "", `/chat/${newSessionId}`);
    }
  };

  // Custom fetch wrapper that intercepts response headers for session ID
  const customFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await fetch(input, init);
      const newSessionId = response.headers.get("X-Session-Id");
      if (newSessionId) {
        sessionUpdateRef.current(newSessionId);
      }
      return response;
    },
    [],
  );

  // Send only the last message to the server (server loads history from DB)
  // Transport is stable - dynamic values are read from refs at request time
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: customFetch,
        prepareSendMessagesRequest: ({ messages }) => {
          // Read current values from refs at request time
          const sessionId = currentSessionIdRef.current;
          const model = selectedModelIdRef.current;
          const tools = toolSettingsRef.current;

          return {
            body: {
              message: messages[messages.length - 1],
              // Server is source of truth for session IDs
              // Send null for new chats, server will generate and return via stream
              sessionId,
              model,
              tools: {
                generateImage: tools.generateImageEnabled,
                generateVideo: tools.generateVideoEnabled,
                webSearch: tools.webSearchEnabled,
              },
            },
          };
        },
      }),
    [customFetch], // Only customFetch - refs are read at request time
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

  // Track previous values to detect navigation vs internal state updates
  const prevSessionIdRef = useRef<string | null>(sessionId);
  const prevNewChatCounterRef = useRef(newChatCounter);

  // Reset when session prop changes (e.g., navigating via sidebar)
  // or when newChatCounter changes (user clicks "New Chat" button)
  // Only react to prop changes, not currentSessionId state changes
  useEffect(() => {
    const prevSessionId = prevSessionIdRef.current;
    const prevCounter = prevNewChatCounterRef.current;
    prevSessionIdRef.current = sessionId;
    prevNewChatCounterRef.current = newChatCounter;

    // Check if user clicked "New Chat" (counter changed)
    const isNewChatClick = newChatCounter !== prevCounter;

    // Check if sessionId prop changed
    const sessionIdChanged = sessionId !== prevSessionId;

    // Only act if something relevant changed
    if (!sessionIdChanged && !isNewChatClick) {
      return;
    }

    if (!sessionId || isNewChatClick) {
      // Navigating to new chat or user clicked "New Chat" - reset everything
      setInitialMessages([]);
      hasLoadedRef.current = null;
      setCurrentSessionId(null);
      isNewChatRef.current = true;
      // Mark that we need to clear messages and trigger the sync effect
      pendingClearRef.current = true;
      setSyncTrigger((prev) => prev + 1);
    } else if (sessionIdChanged) {
      // Navigating to a different existing session - load from DB
      setCurrentSessionId(sessionId);
      isNewChatRef.current = false;
    }
  }, [sessionId, newChatCounter]); // React to sessionId prop and newChatCounter

  const {
    messages,
    status,
    error,
    sendMessage: aiSendMessage,
    stop,
    regenerate,
    setMessages,
  } = useAIChat({
    // Use stable internal ID to prevent hook reset when currentSessionId changes
    id: internalChatId,
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

  // Ref to avoid setMessages in deps (it changes when transport changes, causing unwanted clears)
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  // Sync messages: clear for new chat, or load from DB for existing session
  useEffect(() => {
    if (pendingClearRef.current) {
      // Clear messages when navigating to new chat
      setMessagesRef.current([]);
      pendingClearRef.current = false;
    } else if (initialMessages.length > 0) {
      // Load messages from DB for existing session
      setMessagesRef.current(initialMessages);
    }
    // syncTrigger forces this effect to run when navigating to new chat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages, syncTrigger]);

  const sendMessage = useCallback(
    async (content: string, files?: FileUIPart[]) => {
      const hasText = content.trim().length > 0;
      const hasFiles = files && files.length > 0;

      if (!hasText && !hasFiles) return;

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

      // Send to AI - session ID will be received from server via X-Session-Id header
      aiSendMessage({ parts });
    },
    [aiSendMessage],
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
    currentSessionId,
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
