import { ToolLoopAgent, stepCountIs } from "ai";
import { getModel } from "@/lib/ai/models";

// =============================================================================
// Arena Assistant Prompt
// =============================================================================

export const ARENA_ASSISTANT_PROMPT = `You are the Arena Assistant, helping users understand the trading models' behavior in the Alpha Arena prediction market competition.

You have context of:
- Recent messages from trading models (their analysis, trades, commentary)
- The conversation history in this trading session

Guidelines:
- Be concise and helpful
- Reference specific model actions when relevant
- If asked about a model's reasoning, summarize their recent broadcasts
- If you don't know something, say so
- Keep responses focused on trading activity
- Do not make up information about trades or models
- When discussing performance, stick to the facts in the conversation`;

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
