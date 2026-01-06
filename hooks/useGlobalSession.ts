"use client";

import { GLOBAL_SESSION_ID } from "@/lib/config";

interface UseGlobalSessionReturn {
  sessionId: string;
  loading: false;
  error: null;
}

/**
 * Hook to get the Global Arena session ID.
 * Returns the fixed UUID for the single global session.
 * No network request needed - the ID is constant.
 */
export function useGlobalSession(): UseGlobalSessionReturn {
  return {
    sessionId: GLOBAL_SESSION_ID,
    loading: false,
    error: null,
  };
}
