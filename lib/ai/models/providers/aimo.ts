import { createOpenAI } from "@ai-sdk/openai";
import {
  customProvider,
  wrapLanguageModel,
  defaultSettingsMiddleware,
} from "ai";
import { MODELS } from "../catalog";

const AIMO_BASE_URL = "https://api.aimo.ai/v1";

/**
 * Base AiMo OpenAI-compatible client
 */
const aimoBase = createOpenAI({
  baseURL: AIMO_BASE_URL,
  apiKey: process.env.AIMO_API_KEY ?? "",
});

/**
 * Generate language models from the catalog.
 * AiMo shares the same model catalog as OpenRouter.
 * Maps model IDs like "openrouter/gpt-4o" to short names like "gpt-4o".
 */
const catalogModels = Object.fromEntries(
  MODELS.filter((m) => m.provider === "openrouter").map((model) => {
    // Extract short name from ID (e.g., "openrouter/gpt-4o" -> "gpt-4o")
    const shortName = model.id.replace("openrouter/", "");
    return [shortName, aimoBase.chat(shortName)];
  }),
);

// Default model for aliases (first model in catalog)
const defaultModelId =
  MODELS.find((m) => m.provider === "openrouter")?.id.replace(
    "openrouter/",
    "",
  ) ?? "gpt-4o";

/**
 * AiMo custom provider with models generated from catalog.
 *
 * Shares the same model catalog as OpenRouter, plus provides
 * convenience aliases for common use cases:
 * - fast: Lower temperature for quick responses
 * - creative: Higher temperature for creative writing
 * - precise: Very low temperature for accurate responses
 */
export const aimo = customProvider({
  languageModels: {
    ...catalogModels,

    // Alias: fast responses with lower temperature
    fast: wrapLanguageModel({
      model: aimoBase.chat(defaultModelId),
      middleware: [
        defaultSettingsMiddleware({
          settings: {
            temperature: 0.7,
            maxOutputTokens: 1000,
          },
        }),
      ],
    }),

    // Alias: creative writing with higher temperature
    creative: wrapLanguageModel({
      model: aimoBase.chat(defaultModelId),
      middleware: [
        defaultSettingsMiddleware({
          settings: {
            temperature: 1.0,
          },
        }),
      ],
    }),

    // Alias: precise responses with low temperature
    precise: wrapLanguageModel({
      model: aimoBase.chat(defaultModelId),
      middleware: [
        defaultSettingsMiddleware({
          settings: {
            temperature: 0.3,
          },
        }),
      ],
    }),
  },

  // Allow other model IDs to pass through
  fallbackProvider: aimoBase,
});
