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
  // Debug: confirm this hook version is loaded
  console.log("[DEBUG] useChatMessages hook called with sessionId:", sessionId);

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
    [sessionId, newChatCounter]
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

  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const { generateImageEnabled, generateVideoEnabled, webSearchEnabled } =
    useToolStore.getState();
  const setIsGenerating = useChatStore((s) => s.setIsGenerating);
  const setStoreError = useChatStore((s) => s.setError);
  const setStoreCurrentSession = useChatStore((s) => s.setCurrentSession);
  const triggerSessionRefresh = useChatStore((s) => s.triggerSessionRefresh);

  // Update sessionUpdateRef when dependencies change
  sessionUpdateRef.current = (newSessionId: string) => {
    console.log("[DEBUG] Session update from header:", newSessionId);
    if (!currentSessionId && isNewChatRef.current) {
      console.log("[DEBUG] Updating currentSessionId to:", newSessionId);
      setCurrentSessionId(newSessionId);
      setStoreCurrentSession(newSessionId);
      isNewChatRef.current = false;
      shouldRefreshOnFinishRef.current = true;
      window.history.replaceState(null, "", `/chat/${newSessionId}`);
    }
  };

  // Custom fetch wrapper that intercepts response headers
  const customFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await fetch(input, init);
      // Extract session ID from header if present
      const sessionId = response.headers.get("X-Session-Id");
      if (sessionId) {
        console.log("[DEBUG] Found X-Session-Id header:", sessionId);
        sessionUpdateRef.current(sessionId);
      }
      return response;
    },
    [],
  );

  // Send only the last message to the server (server loads history from DB)
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: customFetch,
        prepareSendMessagesRequest: ({ messages }) => {
          console.log("[DEBUG] prepareSendMessagesRequest called", {
            messageCount: messages.length,
            lastMessage: messages[messages.length - 1],
            currentSessionId,
          });
          return {
            body: {
              message: messages[messages.length - 1],
              // Server is source of truth for session IDs
              // Send null for new chats, server will generate and return via stream
              sessionId: currentSessionId,
              model: selectedModelId,
              tools: {
                generateImage: generateImageEnabled,
                generateVideo: generateVideoEnabled,
                webSearch: webSearchEnabled,
              },
            },
          };
        },
      }),
    [
      customFetch,
      currentSessionId,
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
      // Mark that we need to clear messages and trigger the sync effect
      pendingClearRef.current = true;
      setSyncTrigger((prev) => prev + 1);
    } else if (sessionId !== currentSessionId) {
      // Navigating to a different existing session - load from DB
      setCurrentSessionId(sessionId);
      isNewChatRef.current = false;
    }
  }, [sessionId, currentSessionId]);

  // Fallback handler for session ID via transient data (kept for future AI SDK compatibility)
  // Note: onData may not work with DefaultChatTransport in current AI SDK v6
  // Primary approach uses X-Session-Id response header via customFetch above
  const handleSessionData = useCallback(
    (dataPart: unknown) => {
      console.log("[DEBUG] onData called with:", dataPart);
      // Check if this is a session data part from the server
      if (
        dataPart &&
        typeof dataPart === "object" &&
        "type" in dataPart &&
        (dataPart as { type: string }).type === "data-session" &&
        "data" in dataPart
      ) {
        const data = (dataPart as { data: unknown }).data;
        if (
          data &&
          typeof data === "object" &&
          "sessionId" in data &&
          typeof (data as { sessionId: unknown }).sessionId === "string"
        ) {
          const newSessionId = (data as { sessionId: string }).sessionId;
          console.log("[DEBUG] Received sessionId from server:", newSessionId);

          // Only update if we don't have a session ID yet (new chat)
          if (!currentSessionId && isNewChatRef.current) {
            console.log("[DEBUG] Updating currentSessionId to:", newSessionId);
            setCurrentSessionId(newSessionId);
            setStoreCurrentSession(newSessionId);
            isNewChatRef.current = false;

            // Mark that we need to refresh sessions after response completes
            shouldRefreshOnFinishRef.current = true;

            // Update URL without triggering navigation
            window.history.replaceState(null, "", `/chat/${newSessionId}`);
          }
        }
      }
    },
    [currentSessionId, setStoreCurrentSession],
  );

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
    onData: handleSessionData,
    onFinish: async () => {
      console.log("[DEBUG] onFinish called");
      setIsGenerating(false);
      // Refresh session list if this was a new chat (to show AI-generated title)
      if (shouldRefreshOnFinishRef.current) {
        shouldRefreshOnFinishRef.current = false;
        triggerSessionRefresh();
      }
    },
    onError: (err) => {
      console.log("[DEBUG] onError called:", err.message);
      setIsGenerating(false);
      setStoreError(err.message);
    },
  });

  // Debug: log status and messages changes
  useEffect(() => {
    console.log("[DEBUG] useAIChat state:", { status, messageCount: messages.length, messages });
  }, [status, messages]);

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
      console.log("[DEBUG] sendMessage called:", { content, hasFiles: !!files?.length });
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

      console.log("[DEBUG] Calling aiSendMessage with parts:", parts);
      // Send to AI using the AI SDK sendMessage
      // Session ID will be received from server via X-Session-Id header for new chats
      aiSendMessage({ parts });
      console.log("[DEBUG] aiSendMessage called");
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
