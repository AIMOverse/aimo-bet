import { createProviderRegistry } from "ai";
import { openrouter } from "./openrouter";

/**
 * Unified provider registry for all AI models.
 *
 * Access models using: registry.languageModel('provider/model')
 *
 * Examples:
 * - 'openrouter/gpt-4o' - GPT-4o via OpenRouter
 * - 'openrouter/claude-sonnet-4' - Claude Sonnet 4 via OpenRouter
 * - 'openrouter/deepseek-chat' - DeepSeek Chat via OpenRouter
 * - 'openrouter/anthropic/claude-sonnet-4-20250514' - Full model ID fallback
 */
export const registry = createProviderRegistry(
  {
    openrouter,
    // Future providers can be added here:
    // anthropic,
  },
  { separator: "/" },
);

/**
 * Get a language model by ID.
 *
 * Accepts multiple formats:
 * - Registry format: 'openrouter/gpt-4o', 'openrouter/claude-sonnet-4'
 * - Full OpenRouter model ID: 'openrouter/anthropic/claude-sonnet-4-20250514'
 * - Short name: 'gpt-4o' (defaults to openrouter provider)
 *
 * @param modelId - Model ID in any supported format
 * @returns Language model instance
 *
 * @example
 * const model = getModel('openrouter/gpt-4o');
 * const result = await streamText({ model, prompt: '...' });
 */
export function getModel(modelId: string) {
  // If already in registry format (openrouter/...), use directly
  if (modelId.startsWith("openrouter/")) {
    return registry.languageModel(modelId as `openrouter/${string}`);
  }

  // Default to openrouter provider with the model name
  return registry.languageModel(
    `openrouter/${modelId}` as `openrouter/${string}`,
  );
}
