import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { MODELS } from "../catalog";

const REDPILL_BASE_URL = "https://api.redpill.ai/v1";

/**
 * Base OpenRouter client using OpenAI-compatible API
 */
const openrouterBase = createOpenAI({
  baseURL: REDPILL_BASE_URL,
  apiKey: process.env.REDPILL_API_KEY ?? "",
});

/**
 * Generate language models from the catalog.
 * Maps model IDs like "openrouter/gpt-4o" to short names like "gpt-4o".
 */
const languageModels = Object.fromEntries(
  MODELS.filter((m) => m.provider === "openrouter").map((model) => {
    // Extract short name from ID (e.g., "openrouter/gpt-4o" -> "gpt-4o")
    const shortName = model.id.replace("openrouter/", "");
    return [shortName, openrouterBase.chat(shortName)];
  })
);

/**
 * OpenRouter custom provider with models generated from catalog.
 *
 * Available models (from catalog):
 * - gpt-4o, gpt-4o-mini
 * - claude-sonnet-4, claude-3.5-haiku
 * - gemini-2.0-flash
 * - deepseek-chat
 * - llama-3.3-70b
 * - mistral-large
 *
 * Also supports any OpenRouter model ID via fallback.
 */
export const openrouter = customProvider({
  languageModels,
  fallbackProvider: openrouterBase,
});
