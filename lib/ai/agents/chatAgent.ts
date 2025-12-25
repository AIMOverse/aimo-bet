import { ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";

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

// Schema for runtime call options
const chatCallOptionsSchema = z.object({
  model: z.string().default("openrouter/gpt-4o"),
  mode: z.enum(["user-chat", "arena"]).default("user-chat"),
  tools: z
    .object({
      webSearch: z.boolean().default(false),
    })
    .default({
      webSearch: false,
    }),
});

export type ChatCallOptions = z.infer<typeof chatCallOptionsSchema>;

export const chatAgent = new ToolLoopAgent({
  // Default model (overridden by prepareCall)
  model: getModel("openrouter/gpt-4o"),

  // System instructions
  instructions: DEFAULT_SYSTEM_PROMPT,

  // Stop after 5 steps max (for multi-tool scenarios)
  stopWhen: stepCountIs(5),

  // Call options schema for type-safe runtime configuration
  callOptionsSchema: chatCallOptionsSchema,

  // Configure agent based on request options
  prepareCall: ({ options, ...settings }) => {
    const isArenaMode = options.mode === "arena";

    // Arena mode: simpler model, no tools, different prompt
    if (isArenaMode) {
      return {
        ...settings,
        model: getModel("openrouter/gpt-4o-mini"),
        instructions: ARENA_ASSISTANT_PROMPT,
        activeTools: undefined, // No tools in arena mode
      };
    }

    // Future: if (options.tools.webSearch) activeTools.push("webSearch");

    return {
      ...settings,
      model: getModel(options.model),
    };
  },
});

// Export type for UI message typing
export type ChatAgentUIMessage =
  typeof chatAgent extends ToolLoopAgent<infer _T, infer _O, infer M>
    ? M
    : never;
