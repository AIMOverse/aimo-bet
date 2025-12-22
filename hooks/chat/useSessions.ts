"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ChatSession } from "@/types/chat";
import { useChatStore } from "@/store/chatStore";
import { clearCachedMessages } from "@/lib/cache/messages";

// Module-level state to prevent duplicate fetches across component instances
let globalSessionsPromise: Promise<ChatSession[]> | null = null;
let globalSessionsCache: ChatSession[] | null = null;
let globalLastFetchTime = 0;
let isFetching = false;
const CACHE_TTL = 5000; // 5 seconds

interface UseSessionsReturn {
  /** All chat sessions */
  sessions: ChatSession[];
  /** Currently active session */
  currentSession: ChatSession | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Update a session */
  updateSession: (
    id: string,
    data: Partial<Pick<ChatSession, "title" | "modelId">>,
  ) => Promise<void>;
  /** Delete a session */
  deleteSession: (id: string) => Promise<void>;
  /** Set the current session */
  setCurrentSession: (id: string | null) => void;
  /** Refresh sessions from API */
  refresh: () => Promise<void>;
}

export function useSessions(): UseSessionsReturn {
  const router = useRouter();
  // Initialize with cached data if available
  const [sessions, setSessions] = useState<ChatSession[]>(
    () => globalSessionsCache ?? [],
  );
  const [isLoading, setIsLoading] = useState(() => !globalSessionsCache);
  const [error, setError] = useState<string | null>(null);

  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const setCurrentSessionId = useChatStore((s) => s.setCurrentSession);

  const currentSession =
    sessions.find((s) => s.id === currentSessionId) ?? null;

  // Load sessions from API with deduplication
  const loadSessions = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // Use cached data if available and fresh
    if (
      !forceRefresh &&
      globalSessionsCache &&
      now - globalLastFetchTime < CACHE_TTL
    ) {
      setSessions(globalSessionsCache);
      setIsLoading(false);
      return;
    }

    // Hard block: if already fetching, just skip
    if (isFetching) {
      return;
    }

    // If we have a pending promise, wait for it
    if (globalSessionsPromise) {
      try {
        const sessions = await globalSessionsPromise;
        setSessions(sessions);
      } catch {
        // Error handled by original caller
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      isFetching = true;
      setIsLoading(true);
      setError(null);

      // Create and store the promise
      globalSessionsPromise = (async () => {
        const response = await fetch("/api/sessions");
        if (!response.ok) {
          throw new Error("Failed to fetch sessions");
        }

        const data = await response.json();

        // Convert date strings to Date objects
        const sessionsWithDates: ChatSession[] = data.map(
          (s: {
            id: string;
            title: string;
            modelId: string;
            createdAt: string;
            updatedAt: string;
          }) => ({
            ...s,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          }),
        );

        return sessionsWithDates;
      })();

      const sessionsData = await globalSessionsPromise;
      globalSessionsCache = sessionsData;
      globalLastFetchTime = Date.now();
      setSessions(sessionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      globalSessionsPromise = null;
      isFetching = false;
      setIsLoading(false);
    }
  }, []);

  // Load sessions on mount only
  const mountIdRef = useRef(Math.random().toString(36).slice(2, 8));
  useEffect(() => {
    console.log(
      `[useSessions][${mountIdRef.current}] Component mounted, loading sessions`,
    );
    loadSessions();
    return () => {
      console.log(`[useSessions][${mountIdRef.current}] Component unmounting`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSession = useCallback(
    async (
      id: string,
      data: Partial<Pick<ChatSession, "title" | "modelId">>,
    ) => {
      try {
        const response = await fetch(`/api/sessions?id=${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error("Failed to update session");
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, ...data, updatedAt: new Date() } : s,
          ),
        );
      } catch (err) {
        console.error("Failed to update session:", err);
        throw err;
      }
    },
    [],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/sessions?id=${id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to delete session");
        }

        // Clear message cache for this session
        clearCachedMessages(id);

        setSessions((prev) => prev.filter((s) => s.id !== id));

        // If deleting current session, navigate to new chat
        if (currentSessionId === id) {
          setCurrentSessionId(null);
          router.push("/chat");
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
        throw err;
      }
    },
    [currentSessionId, setCurrentSessionId, router],
  );

  const setCurrentSession = useCallback(
    (id: string | null) => {
      setCurrentSessionId(id);
    },
    [setCurrentSessionId],
  );

  // Force refresh bypasses the cache
  const forceRefresh = useCallback(() => loadSessions(true), [loadSessions]);

  return {
    sessions,
    currentSession,
    isLoading,
    error,
    updateSession,
    deleteSession,
    setCurrentSession,
    refresh: forceRefresh,
  };
}
