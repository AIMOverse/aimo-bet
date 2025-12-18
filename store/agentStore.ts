/**
 * Agent Store
 *
 * Zustand store for managing agent selection and custom agent configuration.
 * Persisted to localStorage for cross-session continuity.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentSource, CustomAgentConfig } from "@/types/agents";

// ============================================================================
// Constants
// ============================================================================

/** Custom agent ID constant */
export const CUSTOM_AGENT_ID = "custom-agent";

/** Default custom agent configuration */
const DEFAULT_CUSTOM_AGENT: CustomAgentConfig = {
  id: CUSTOM_AGENT_ID,
  name: "My Agent",
  description: "",
  modelId: "",
  tools: [],
  systemPrompt: "",
  settings: {
    maxSteps: 10,
    temperature: 0.7,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ============================================================================
// Store Types
// ============================================================================

interface AgentState {
  /** Currently selected agent ID (null = no agent selected) */
  selectedAgentId: string | null;

  /** Source of the selected agent */
  selectedAgentSource: AgentSource | null;

  /** Custom agent configuration (single, stored in localStorage) */
  customAgent: CustomAgentConfig;

  /** Set the selected agent with source */
  setSelectedAgent: (agentId: string | null, source: AgentSource | null) => void;

  /** Select the custom agent */
  selectCustomAgent: () => void;

  /** Set custom agent configuration */
  setCustomAgent: (config: CustomAgentConfig) => void;

  /** Update custom agent configuration (partial update) */
  updateCustomAgent: (updates: Partial<Omit<CustomAgentConfig, "id">>) => void;

  /** Reset custom agent to defaults */
  resetCustomAgent: () => void;

  /** Clear agent selection */
  clearSelection: () => void;

  /** Check if custom agent is selected */
  isCustomAgentSelected: () => boolean;

  /** Check if custom agent is configured (has model selected) */
  isCustomAgentConfigured: () => boolean;
}

// ============================================================================
// Store
// ============================================================================

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      selectedAgentId: null,
      selectedAgentSource: null,
      customAgent: DEFAULT_CUSTOM_AGENT,

      setSelectedAgent: (agentId, source) =>
        set({
          selectedAgentId: agentId,
          selectedAgentSource: source,
        }),

      selectCustomAgent: () =>
        set({
          selectedAgentId: CUSTOM_AGENT_ID,
          selectedAgentSource: "custom",
        }),

      setCustomAgent: (config) =>
        set({
          customAgent: {
            ...config,
            updatedAt: new Date().toISOString(),
          },
        }),

      updateCustomAgent: (updates) =>
        set((state) => ({
          customAgent: {
            ...state.customAgent,
            ...updates,
            updatedAt: new Date().toISOString(),
          },
        })),

      resetCustomAgent: () =>
        set({
          customAgent: {
            ...DEFAULT_CUSTOM_AGENT,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),

      clearSelection: () =>
        set({
          selectedAgentId: null,
          selectedAgentSource: null,
        }),

      isCustomAgentSelected: () => {
        const state = get();
        return (
          state.selectedAgentId === CUSTOM_AGENT_ID &&
          state.selectedAgentSource === "custom"
        );
      },

      isCustomAgentConfigured: () => {
        const state = get();
        return state.customAgent.modelId !== "";
      },
    }),
    {
      name: "aimo-chat-agent",
    }
  )
);
