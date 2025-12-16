/**
 * Agent Store
 *
 * Zustand store for managing selected agent state.
 * Persisted to localStorage for cross-session continuity.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AgentState {
  /** Currently selected agent ID (null = use default model, no agent) */
  selectedAgentId: string | null;

  /** Set the selected agent */
  setSelectedAgent: (agentId: string | null) => void;

  /** Clear agent selection */
  clearAgent: () => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      selectedAgentId: null,

      setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),

      clearAgent: () => set({ selectedAgentId: null }),
    }),
    {
      name: "aimo-chat-agent",
    }
  )
);
