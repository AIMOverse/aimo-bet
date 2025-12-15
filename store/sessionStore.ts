"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  /** Currently active session ID */
  currentSessionId: string | null;

  /** Set the current session */
  setCurrentSession: (id: string | null) => void;

  /** Hydration state for SSR */
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      currentSessionId: null,

      setCurrentSession: (id) => set({ currentSessionId: id }),

      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "aimo-chat-session",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/**
 * Hook to wait for hydration before using persisted state
 */
export function useSessionHydration() {
  return useSessionStore((state) => state._hasHydrated);
}
