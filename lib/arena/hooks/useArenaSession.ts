"use client";

import useSWR from "swr";
import { fetchActiveSession, fetchSession } from "../api";
import { POLLING_INTERVALS } from "../constants";
import type { TradingSession } from "@/types/arena";

/**
 * Hook to fetch and manage the active trading session
 */
export function useActiveSession() {
  const { data, error, isLoading, mutate } = useSWR<TradingSession | null>(
    "arena/active-session",
    fetchActiveSession,
    {
      refreshInterval: POLLING_INTERVALS.session,
      revalidateOnFocus: true,
    }
  );

  return {
    session: data,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch a specific trading session by ID
 */
export function useSession(sessionId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<TradingSession>(
    sessionId ? `arena/session/${sessionId}` : null,
    () => (sessionId ? fetchSession(sessionId) : null),
    {
      refreshInterval: POLLING_INTERVALS.session,
    }
  );

  return {
    session: data,
    isLoading,
    error,
    mutate,
  };
}
