import { createOpenAI } from "@ai-sdk/openai";
import {
  customProvider,
  wrapLanguageModel,
  defaultSettingsMiddleware,
} from "ai";
import { getDefaultProvider } from "./providers";
import { MODELS } from "./catalog";
import { loggingMiddleware } from "../middleware";

// Get configuration from central config
const provider = getDefaultProvider();
const AIMO_BASE_URL = provider.baseUrl;
const DEEPSEEK_MODEL_ID = MODELS[0].id;
const GPT_OSS_MODEL_ID = MODELS[1].id;
const GLM_MODEL_ID = MODELS[2].id;

/**
 * Base AiMo OpenAI-compatible client
 */
const aimoBase = createOpenAI({
  baseURL: AIMO_BASE_URL,
  apiKey: process.env.AIMO_API_KEY ?? "",
});

/**
 * AiMo custom provider with pre-configured models and middleware
 */
export const aimo = customProvider({
  languageModels: {
    // DeepSeek V3.1 - Default model
    "deepseek-v3.1": wrapLanguageModel({
      model: aimoBase.chat(DEEPSEEK_MODEL_ID),
      middleware: [loggingMiddleware],
    }),

    // GPT-OSS-120B model
    "gpt-oss-120b": wrapLanguageModel({
      model: aimoBase.chat(GPT_OSS_MODEL_ID),
      middleware: [loggingMiddleware],
    }),

    // GLM 4.6 model
    "glm-4.6": wrapLanguageModel({
      model: aimoBase.chat(GLM_MODEL_ID),
      middleware: [loggingMiddleware],
    }),

    // Alias: fast responses with lower temperature
    fast: wrapLanguageModel({
      model: aimoBase.chat(DEEPSEEK_MODEL_ID),
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
      model: aimoBase.chat(DEEPSEEK_MODEL_ID),
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
      model: aimoBase.chat(DEEPSEEK_MODEL_ID),
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
