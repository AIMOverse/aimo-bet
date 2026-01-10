import type { LanguageModel } from "ai";
import { MODELS } from "./catalog";
import { getAimoModel } from "./providers/aimo";

/**
 * Resolve the provider-specific model ID.
 * Falls back to the canonical ID if no provider-specific mapping exists.
 */
function resolveModelId(modelId: string): string {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model?.providerIds?.aimo) {
    console.log(
      `[ModelRegistry] No provider mapping for "${modelId}", using as-is`,
    );
    return modelId;
  }
  const resolvedId = model.providerIds.aimo;
  console.log(`[ModelRegistry] Resolved "${modelId}" → "${resolvedId}"`);
  return resolvedId;
}

/**
 * Get a language model by ID.
 *
 * Each model uses its own wallet for API payments via AiMo Network.
 *
 * @param modelId - Model ID (e.g., "openai/gpt-5.2", "claude/claude-sonnet-4.5")
 * @returns Language model instance
 *
 * @example
 * const model = await getModel("openai/gpt-5.2");
 * const result = await generateText({ model, prompt: "..." });
 */
export async function getModel(modelId: string): Promise<LanguageModel> {
  console.log(`[ModelRegistry] getModel called with "${modelId}"`);

  const resolvedId = resolveModelId(modelId);

  console.log(
    `[ModelRegistry] Using AiMo for "${resolvedId}" (canonical: "${modelId}")`,
  );
  // Pass both resolved ID (for API call) and canonical ID (for wallet lookup)
  return getAimoModel(resolvedId, modelId) as Promise<LanguageModel>;
}
