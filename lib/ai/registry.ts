import { createProviderRegistry } from "ai";
import { aimo } from "./providers";

/**
 * Unified provider registry for all AI models.
 *
 * Access models using: registry.languageModel('provider/model')
 *
 * Examples:
 * - 'aimo/fast' - Fast responses with lower temperature
 * - 'aimo/creative' - Creative writing with higher temperature
 * - 'aimo/precise' - Precise responses with low temperature
 * - 'aimo/gpt-oss-120b' - Default model
 * - 'aimo/any-model-id' - Fallback to base provider
 */
export const registry = createProviderRegistry(
  {
    aimo,
    // Future providers can be added here:
    // openrouter,
    // anthropic,
  },
  { separator: "/" },
);

/**
 * Get a language model by ID.
 *
 * Accepts multiple formats:
 * - Registry format: 'aimo/gpt-oss-120b', 'aimo/fast', 'aimo/creative'
 * - Full model ID: '9D9ZcNGUSDCfiDQ4DcGvvF1de5s9cqZuE5T7KcWFSgV6:openai/gpt-oss-120b'
 * - Short name: 'gpt-oss-120b'
 *
 * @param modelId - Model ID in any supported format
 * @returns Language model instance
 *
 * @example
 * const model = getModel('aimo/fast');
 * const result = await streamText({ model, prompt: '...' });
 */
export function getModel(modelId: string) {
  // If already in registry format (aimo/...), use directly
  if (modelId.startsWith("aimo/")) {
    return registry.languageModel(modelId as `aimo/${string}`);
  }

  // Extract model name from full ID format (e.g., "xxx:openai/gpt-oss-120b" -> "gpt-oss-120b")
  const modelName = modelId.includes("/") ? modelId.split("/").pop()! : modelId;

  // Use the aimo provider with the extracted model name
  return registry.languageModel(`aimo/${modelName}` as `aimo/${string}`);
}
