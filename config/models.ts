import type { ModelDefinition } from "@/types/models";

/**
 * Default OpenAI models available for chat
 */
export const MODELS: ModelDefinition[] = [
  {
    id: "9D9ZcNGUSDCfiDQ4DcGvvF1de5s9cqZuE5T7KcWFSgV6:openai/gpt-oss-120b",
    name: "gpt-oss-120b",
    provider: "aimo-network",
    contextLength: 128000,
    pricing: { prompt: 2.5, completion: 10 },
    description: "Most capable model, great for complex tasks",
    supportsVision: true,
    supportsFunctions: true,
  },
];

/**
 * Get model by ID
 */
export function getModelById(id: string): ModelDefinition | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: string): ModelDefinition[] {
  return MODELS.filter((m) => m.provider === provider);
}
