"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ToolState {
  /** Whether image generation tool is enabled */
  generateImageEnabled: boolean;

  /** Whether web search tool is enabled */
  webSearchEnabled: boolean;

  /** Toggle image generation tool */
  setGenerateImageEnabled: (enabled: boolean) => void;

  /** Toggle web search tool */
  setWebSearchEnabled: (enabled: boolean) => void;
}

export const useToolStore = create<ToolState>()(
  persist(
    (set) => ({
      generateImageEnabled: true,
      webSearchEnabled: true,

      setGenerateImageEnabled: (enabled) =>
        set({ generateImageEnabled: enabled }),

      setWebSearchEnabled: (enabled) => set({ webSearchEnabled: enabled }),
    }),
    {
      name: "aimo-chat-tools",
    },
  ),
);
