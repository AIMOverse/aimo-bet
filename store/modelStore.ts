"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODEL_ID } from "@/config/defaults";

interface ModelState {
  /** Currently selected model ID */
  selectedModelId: string;

  /** Set the selected model */
  setSelectedModel: (id: string) => void;

  /** Hydration state for SSR */
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      selectedModelId: DEFAULT_MODEL_ID,

      setSelectedModel: (id) => set({ selectedModelId: id }),

      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "aimo-chat-model",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/**
 * Hook to wait for hydration before using persisted state
 */
export function useModelHydration() {
  return useModelStore((state) => state._hasHydrated);
}
