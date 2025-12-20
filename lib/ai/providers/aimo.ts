import { createOpenAI } from "@ai-sdk/openai";
import {
  customProvider,
  wrapLanguageModel,
  defaultSettingsMiddleware,
} from "ai";
import { getDefaultProvider } from "@/config/providers";
import { MODELS } from "@/config/models";
import { loggingMiddleware } from "../middleware";

// Get configuration from central config
const provider = getDefaultProvider();
const AIMO_BASE_URL = provider.baseUrl;
const DEFAULT_MODEL_ID = MODELS[0].id;

/**
 * Base AiMo OpenAI-compatible client
 */
const aimoBase = createOpenAI({
  baseURL: AIMO_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

/**
 * AiMo custom provider with pre-configured models and middleware
 */
export const aimo = customProvider({
  languageModels: {
    // Default model with logging
    "gpt-oss-120b": wrapLanguageModel({
      model: aimoBase.chat(DEFAULT_MODEL_ID),
      middleware: [loggingMiddleware],
    }),

    // Alias: fast responses with lower temperature
    fast: wrapLanguageModel({
      model: aimoBase.chat(DEFAULT_MODEL_ID),
      middleware: [
        loggingMiddleware,
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
      model: aimoBase.chat(DEFAULT_MODEL_ID),
      middleware: [
        loggingMiddleware,
        defaultSettingsMiddleware({
          settings: {
            temperature: 1.0,
          },
        }),
      ],
    }),

    // Alias: precise responses with low temperature
    precise: wrapLanguageModel({
      model: aimoBase.chat(DEFAULT_MODEL_ID),
      middleware: [
        loggingMiddleware,
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
