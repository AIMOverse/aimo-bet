import { createOpenAI } from "@ai-sdk/openai";
import { customProvider, wrapLanguageModel } from "ai";
import { loggingMiddleware } from "../middleware/logging";

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
    "claude-sonnet-4": wrapLanguageModel({
      model: openrouterBase.chat("anthropic/claude-sonnet-4"),
      middleware: [loggingMiddleware],
    }),

    // Claude 3.5 Haiku
    "claude-3.5-haiku": wrapLanguageModel({
      model: openrouterBase.chat("anthropic/claude-3.5-haiku"),
      middleware: [loggingMiddleware],
    }),

    // GPT-4o
    "gpt-4o": wrapLanguageModel({
      model: openrouterBase.chat("openai/gpt-4o"),
      middleware: [loggingMiddleware],
    }),

    // GPT-4o Mini
    "gpt-4o-mini": wrapLanguageModel({
      model: openrouterBase.chat("openai/gpt-4o-mini"),
      middleware: [loggingMiddleware],
    }),

    // Gemini 2.0 Flash
    "gemini-2.0-flash": wrapLanguageModel({
      model: openrouterBase.chat("google/gemini-2.0-flash-exp"),
      middleware: [loggingMiddleware],
    }),

    // Llama 3.3 70B
    "llama-3.3-70b": wrapLanguageModel({
      model: openrouterBase.chat("meta-llama/llama-3.3-70b-instruct"),
      middleware: [loggingMiddleware],
    }),

    // DeepSeek Chat
    "deepseek-chat": wrapLanguageModel({
      model: openrouterBase.chat("deepseek/deepseek-chat"),
      middleware: [loggingMiddleware],
    }),

    // Mistral Large
    "mistral-large": wrapLanguageModel({
      model: openrouterBase.chat("mistralai/mistral-large"),
      middleware: [loggingMiddleware],
    }),
  },

  // Allow any OpenRouter model ID to pass through
  fallbackProvider: openrouterBase,
});
