"use client";

import { useState, useEffect, useCallback } from "react";
import type { ChatSession } from "@/types/chat";
import { getStorageAdapter } from "@/lib/storage";
import { useSessionStore } from "@/store/sessionStore";
import { useModelStore } from "@/store/modelStore";
import { DEFAULT_SESSION_TITLE } from "@/config/defaults";

interface UseSessionsReturn {
  /** All chat sessions */
  sessions: ChatSession[];
  /** Currently active session */
  currentSession: ChatSession | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Create a new session */
  createSession: (title?: string) => Promise<ChatSession>;
  /** Update a session */
  updateSession: (id: string, data: Partial<Pick<ChatSession, "title" | "modelId">>) => Promise<void>;
  /** Delete a session */
  deleteSession: (id: string) => Promise<void>;
  /** Set the current session */
  setCurrentSession: (id: string | null) => void;
  /** Refresh sessions from storage */
  refresh: () => Promise<void>;
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const setCurrentSessionId = useSessionStore((s) => s.setCurrentSession);
  const selectedModelId = useModelStore((s) => s.selectedModelId);

  const currentSession = sessions.find((s) => s.id === currentSessionId) ?? null;

  const storage = getStorageAdapter();

  // Load sessions on mount
  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await storage.getSessions();
      setSessions(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const createSession = useCallback(
    async (title?: string): Promise<ChatSession> => {
      const newSession = await storage.createSession({
        title: title ?? DEFAULT_SESSION_TITLE,
        modelId: selectedModelId,
      });

      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);

      return newSession;
    },
    [storage, selectedModelId, setCurrentSessionId]
  );

  const updateSession = useCallback(
    async (id: string, data: Partial<Pick<ChatSession, "title" | "modelId">>) => {
      await storage.updateSession(id, data);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, ...data, updatedAt: new Date() } : s
        )
      );
    },
    [storage]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await storage.deleteSession(id);

      setSessions((prev) => prev.filter((s) => s.id !== id));

      // If deleting current session, clear selection
      if (currentSessionId === id) {
        setCurrentSessionId(null);
      }
    },
    [storage, currentSessionId, setCurrentSessionId]
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
    createSession,
    updateSession,
    deleteSession,
    setCurrentSession,
    refresh: loadSessions,
  };
}
