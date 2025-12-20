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
  { separator: "/" }
);

/**
 * Get a language model by ID.
 *
 * @param modelId - Model ID in format 'provider/model'
 * @returns Language model instance
 *
 * @example
 * const model = getModel('aimo/fast');
 * const result = await streamText({ model, prompt: '...' });
 */
export function getModel(modelId: string) {
  return registry.languageModel(modelId as `aimo/${string}`);
}
