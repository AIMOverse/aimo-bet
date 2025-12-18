"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ChatSession } from "@/types/chat";
import { useSessionStore } from "@/store/sessionStore";
import { clearCachedMessages } from "@/lib/cache/messages";

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
    data: Partial<Pick<ChatSession, "title" | "modelId">>
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
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const setCurrentSessionId = useSessionStore((s) => s.setCurrentSession);

  const currentSession =
    sessions.find((s) => s.id === currentSessionId) ?? null;

  // Load sessions from API
  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

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
        })
      );

      setSessions(sessionsWithDates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const updateSession = useCallback(
    async (
      id: string,
      data: Partial<Pick<ChatSession, "title" | "modelId">>
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
            s.id === id ? { ...s, ...data, updatedAt: new Date() } : s
          )
        );
      } catch (err) {
        console.error("Failed to update session:", err);
        throw err;
      }
    },
    []
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
          router.push("/chat/new");
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
        throw err;
      }
    },
    [currentSessionId, setCurrentSessionId, router]
  );

  const setCurrentSession = useCallback(
    (id: string | null) => {
      setCurrentSessionId(id);
    },
    [setCurrentSessionId]
  );

  return {
    sessions,
    currentSession,
    isLoading,
    error,
    updateSession,
    deleteSession,
    setCurrentSession,
    refresh: loadSessions,
  };
}
