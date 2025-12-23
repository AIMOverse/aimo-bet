"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArenaTab, TradeFilter, TradingSession } from "@/types/arena";

interface ArenaState {
  /** Currently active tab */
  activeTab: ArenaTab;

  /** Current trading session ID */
  activeSessionId: string | null;

  /** Trade filter options */
  tradeFilter: TradeFilter;

  /** Selected model ID for filtering (null = all models) */
  selectedModelId: string | null;

  /** Whether the performance chart is expanded */
  chartExpanded: boolean;

  /** Set the active tab */
  setActiveTab: (tab: ArenaTab) => void;

  /** Set the active session */
  setActiveSession: (sessionId: string | null) => void;

  /** Update trade filter */
  setTradeFilter: (filter: Partial<TradeFilter>) => void;

  /** Clear trade filter */
  clearTradeFilter: () => void;

  /** Set selected model for filtering */
  setSelectedModel: (modelId: string | null) => void;

  /** Toggle chart expanded state */
  toggleChartExpanded: () => void;

  /** Reset all arena state */
  resetArenaState: () => void;

  /** Hydration state for SSR */
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

const initialState = {
  activeTab: "performance" as ArenaTab,
  activeSessionId: null,
  tradeFilter: {},
  selectedModelId: null,
  chartExpanded: false,
};

export const useArenaStore = create<ArenaState>()(
  persist(
    (set) => ({
      ...initialState,

      setActiveTab: (tab) => set({ activeTab: tab }),

      setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

      setTradeFilter: (filter) =>
        set((state) => ({
          tradeFilter: { ...state.tradeFilter, ...filter },
        })),

      clearTradeFilter: () => set({ tradeFilter: {} }),

      setSelectedModel: (modelId) => set({ selectedModelId: modelId }),

      toggleChartExpanded: () =>
        set((state) => ({ chartExpanded: !state.chartExpanded })),

      resetArenaState: () => set(initialState),

      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "aimo-arena",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/**
 * Hook to wait for hydration before using persisted state
 */
export function useArenaHydration() {
  return useArenaStore((state) => state._hasHydrated);
}

/**
 * Selector for active tab
 */
export function useActiveTab() {
  return useArenaStore((state) => state.activeTab);
}

/**
 * Selector for active session
 */
export function useActiveSession() {
  return useArenaStore((state) => state.activeSessionId);
}

/**
 * Selector for trade filter
 */
export function useTradeFilter() {
  return useArenaStore((state) => state.tradeFilter);
}
