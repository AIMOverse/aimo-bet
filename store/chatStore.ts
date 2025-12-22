"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

interface ChatState {
  /** Currently active session ID */
  currentSessionId: string | null;

  /** Connection status to AI */
  connectionStatus: ConnectionStatus;

  /** Whether the AI is currently generating a response */
  isGenerating: boolean;

  /** Error message if any */
  error: string | null;

  /** Counter to trigger session list refresh */
  sessionRefreshTrigger: number;

  /** Counter to signal new chat request (forces hook to generate new internal ID) */
  newChatCounter: number;

  /** Set the current session */
  setCurrentSession: (id: string | null) => void;

  /** Request a new chat (increments counter to force fresh state) */
  requestNewChat: () => void;

  /** Set connection status */
  setConnectionStatus: (status: ConnectionStatus) => void;

  /** Set generating state */
  setIsGenerating: (isGenerating: boolean) => void;

  /** Set error */
  setError: (error: string | null) => void;

  /** Clear error */
  clearError: () => void;

  /** Trigger a refresh of the session list */
  triggerSessionRefresh: () => void;

  /** Reset chat state (keeps currentSessionId) */
  reset: () => void;
}

const initialState = {
  connectionStatus: "idle" as ConnectionStatus,
  isGenerating: false,
  error: null,
  sessionRefreshTrigger: 0,
  newChatCounter: 0,
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      currentSessionId: null,
      ...initialState,

      setCurrentSession: (id) => set({ currentSessionId: id }),

      requestNewChat: () =>
        set((state) => ({
          currentSessionId: null,
          newChatCounter: state.newChatCounter + 1,
        })),

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

      triggerSessionRefresh: () =>
        set((state) => ({
          sessionRefreshTrigger: state.sessionRefreshTrigger + 1,
        })),

      reset: () => set(initialState),
    }),
    {
      name: "aimo-chat",
      partialize: (state) => ({ currentSessionId: state.currentSessionId }),
    },
  ),
);
