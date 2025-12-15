"use client";

import { create } from "zustand";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

interface ChatState {
  /** Connection status to AI */
  connectionStatus: ConnectionStatus;

  /** Whether the AI is currently generating a response */
  isGenerating: boolean;

  /** Error message if any */
  error: string | null;

  /** Set connection status */
  setConnectionStatus: (status: ConnectionStatus) => void;

  /** Set generating state */
  setIsGenerating: (isGenerating: boolean) => void;

  /** Set error */
  setError: (error: string | null) => void;

  /** Clear error */
  clearError: () => void;

  /** Reset chat state */
  reset: () => void;
}

const initialState = {
  connectionStatus: "idle" as ConnectionStatus,
  isGenerating: false,
  error: null,
};

export const useChatStore = create<ChatState>()((set) => ({
  ...initialState,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setIsGenerating: (isGenerating) =>
    set({
      isGenerating,
      connectionStatus: isGenerating ? "connected" : "idle",
    }),

  setError: (error) =>
    set({
      error,
      connectionStatus: error ? "error" : "idle",
      isGenerating: false,
    }),

  clearError: () => set({ error: null, connectionStatus: "idle" }),

  reset: () => set(initialState),
}));
