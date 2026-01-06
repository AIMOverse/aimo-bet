import type { LanguageModel } from "ai";
import { MODELS } from "./catalog";
import { getAimoModel } from "./providers/aimo";
import { openrouter } from "./providers/openrouter";

type Provider = "aimo" | "openrouter";

/**
 * AI Provider Configuration
 *
 * Set AI_PROVIDER env var to explicitly choose a provider:
 * - "aimo" → Use AiMo Network (each model uses its own wallet)
 * - "openrouter" → Use OpenRouter exclusively
 * - undefined → Use AiMo Network as default
 */
function getProviderType(): Provider {
  const explicit = process.env.AI_PROVIDER;

  if (explicit === "openrouter") {
    return "openrouter";
  }

  // Default to aimo
  return "aimo";
}

const providerType = getProviderType();

/**
 * Resolve the provider-specific model ID.
 * Falls back to the canonical ID if no provider-specific mapping exists.
 */
function resolveModelId(modelId: string, provider: Provider): string {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model?.providerIds) {
    return modelId;
  }
  return model.providerIds[provider] ?? modelId;
}

/**
 * Get a language model by ID.
 *
 * When using AiMo provider, each model uses its own wallet for API payments.
 *
 * @param modelId - Model ID (e.g., "openai/gpt-5.2", "claude/claude-sonnet-4.5")
 * @returns Language model instance
 *
 * @example
 * const model = await getModel("openai/gpt-5.2");
 * const result = await generateText({ model, prompt: "..." });
 */
export async function getModel(modelId: string): Promise<LanguageModel> {
  const resolvedId = resolveModelId(modelId, providerType);

  if (providerType === "openrouter") {
    return openrouter(resolvedId) as LanguageModel;
  }

  // Pass both resolved ID (for API call) and canonical ID (for wallet lookup)
  return getAimoModel(resolvedId, modelId) as Promise<LanguageModel>;
}
