import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Base OpenRouter client using OpenAI-compatible API
 * OpenRouter provides an OpenAI-compatible endpoint
 */
const openrouterBase = createOpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

/**
 * OpenRouter custom provider with pre-configured models and middleware
 *
 * Popular models available through OpenRouter:
 * - anthropic/claude-sonnet-4
 * - anthropic/claude-3.5-haiku
 * - openai/gpt-4o
 * - openai/gpt-4o-mini
 * - google/gemini-2.0-flash-exp
 * - meta-llama/llama-3.3-70b-instruct
 * - deepseek/deepseek-chat
 * - mistralai/mistral-large
 */
export const openrouter = customProvider({
  languageModels: {
    // Claude Sonnet 4
    "claude-sonnet-4": openrouterBase.chat("anthropic/claude-sonnet-4"),

    // Claude 3.5 Haiku
    "claude-3.5-haiku": openrouterBase.chat("anthropic/claude-3.5-haiku"),

    // GPT-4o
    "gpt-4o": openrouterBase.chat("openai/gpt-4o"),

    // GPT-4o Mini
    "gpt-4o-mini": openrouterBase.chat("openai/gpt-4o-mini"),

    // Gemini 2.0 Flash
    "gemini-2.0-flash": openrouterBase.chat("google/gemini-2.0-flash-exp"),

    // Llama 3.3 70B
    "llama-3.3-70b": openrouterBase.chat("meta-llama/llama-3.3-70b-instruct"),

    // DeepSeek Chat
    "deepseek-chat": openrouterBase.chat("deepseek/deepseek-chat"),

    // Mistral Large
    "mistral-large": openrouterBase.chat("mistralai/mistral-large"),
  },

  // Allow any OpenRouter model ID to pass through
  fallbackProvider: openrouterBase,
});
