import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * OpenRouter provider using the official AI SDK provider.
 *
 * Supports any OpenRouter model ID (e.g., "openai/gpt-4o", "anthropic/claude-3.5-sonnet").
 *
 * Usage:
 *   import { openrouter } from "@/lib/ai/models";
 *   const model = openrouter.chat("openai/gpt-4o");
 */
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});
