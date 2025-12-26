import { ToolLoopAgent, stepCountIs } from "ai";
import { getModel } from "@/lib/ai/models";
import { ARENA_ASSISTANT_PROMPT } from "@/lib/ai/prompts/chat/assistantPrompt";

// Re-export prompt for backwards compatibility
export { ARENA_ASSISTANT_PROMPT };

// =============================================================================
// Chat Agent
// =============================================================================

export const chatAgent = new ToolLoopAgent({
  // Default model for arena assistant
  model: getModel("openrouter/gpt-4o-mini"),

  // System instructions
  instructions: ARENA_ASSISTANT_PROMPT,

  // Stop after 5 steps max (for multi-tool scenarios)
  stopWhen: stepCountIs(5),
});

// Export type for UI message typing
export type ChatAgentUIMessage =
  typeof chatAgent extends ToolLoopAgent<infer _T, infer _O, infer M>
    ? M
    : never;

// For backwards compatibility
export type ChatCallOptions = Record<string, never>;
