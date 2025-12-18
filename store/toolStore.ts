/**
 * Tool Store
 *
 * Zustand store for managing enabled tools.
 * Supports global defaults (persisted) and per-session overrides.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ToolState {
  /** Globally enabled tools (persisted, used as defaults) */
  globalEnabledTools: string[];

  /** Set all globally enabled tools */
  setGlobalEnabledTools: (toolIds: string[]) => void;

  /** Toggle a single tool on/off globally */
  toggleGlobalTool: (toolId: string) => void;

  /** Enable a tool globally */
  enableGlobalTool: (toolId: string) => void;

  /** Disable a tool globally */
  disableGlobalTool: (toolId: string) => void;

  /** Check if a tool is enabled globally */
  isToolEnabled: (toolId: string) => boolean;

  /** Reset to default tools */
  resetToDefaults: () => void;
}

/** Default tools enabled by default */
const DEFAULT_ENABLED_TOOLS: string[] = [
  "getCurrentTime",
  "generateUUID",
  "base64",
  "urlEncode",
  "jsonFormat",
  "generateImage",
];

export const useToolStore = create<ToolState>()(
  persist(
    (set, get) => ({
      globalEnabledTools: DEFAULT_ENABLED_TOOLS,

      setGlobalEnabledTools: (toolIds) => set({ globalEnabledTools: toolIds }),

      toggleGlobalTool: (toolId) => {
        const current = get().globalEnabledTools;
        const updated = current.includes(toolId)
          ? current.filter((id) => id !== toolId)
          : [...current, toolId];
        set({ globalEnabledTools: updated });
      },

      enableGlobalTool: (toolId) => {
        const current = get().globalEnabledTools;
        if (!current.includes(toolId)) {
          set({ globalEnabledTools: [...current, toolId] });
        }
      },

      disableGlobalTool: (toolId) => {
        const current = get().globalEnabledTools;
        set({ globalEnabledTools: current.filter((id) => id !== toolId) });
      },

      isToolEnabled: (toolId) => {
        return get().globalEnabledTools.includes(toolId);
      },

      resetToDefaults: () => set({ globalEnabledTools: DEFAULT_ENABLED_TOOLS }),
    }),
    {
      name: "aimo-chat-tools",
    },
  ),
);

// ============================================================================
// Session Tool Overrides (not persisted in store)
// ============================================================================

/**
 * Merge global tools with session-specific overrides.
 * Session overrides are stored with the session data, not in this store.
 *
 * @param globalTools - Global enabled tools from store
 * @param sessionOverrides - Per-session tool overrides (optional)
 * @returns Merged list of enabled tools for the session
 */
export function mergeToolsWithSession(
  globalTools: string[],
  sessionOverrides?: { enabled?: string[]; disabled?: string[] },
): string[] {
  if (!sessionOverrides) {
    return globalTools;
  }

  let result = [...globalTools];

  // Add session-enabled tools
  if (sessionOverrides.enabled) {
    for (const toolId of sessionOverrides.enabled) {
      if (!result.includes(toolId)) {
        result.push(toolId);
      }
    }
  }

  // Remove session-disabled tools
  if (sessionOverrides.disabled) {
    result = result.filter((id) => !sessionOverrides.disabled!.includes(id));
  }

  return result;
}
