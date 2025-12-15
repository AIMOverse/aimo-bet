import type { ModelDefinition } from "@/types/models";

/**
 * Default OpenAI models available for chat
 */
export const MODELS: ModelDefinition[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    contextLength: 128000,
    pricing: { prompt: 2.5, completion: 10 },
    description: "Most capable model, great for complex tasks",
    supportsVision: true,
    supportsFunctions: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    contextLength: 128000,
    pricing: { prompt: 0.15, completion: 0.6 },
    description: "Fast and affordable for everyday tasks",
    supportsVision: true,
    supportsFunctions: true,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    contextLength: 128000,
    pricing: { prompt: 10, completion: 30 },
    description: "Previous generation, still powerful",
    supportsVision: true,
    supportsFunctions: true,
  },
  {
    id: "gpt-4",
    name: "GPT-4",
    provider: "openai",
    contextLength: 8192,
    pricing: { prompt: 30, completion: 60 },
    description: "Original GPT-4, smaller context window",
    supportsVision: false,
    supportsFunctions: true,
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "openai",
    contextLength: 16385,
    pricing: { prompt: 0.5, completion: 1.5 },
    description: "Fast and cost-effective for simpler tasks",
    supportsVision: false,
    supportsFunctions: true,
  },
  {
    id: "o1",
    name: "o1",
    provider: "openai",
    contextLength: 200000,
    pricing: { prompt: 15, completion: 60 },
    description: "Reasoning model for complex problems",
    supportsVision: true,
    supportsFunctions: false,
  },
  {
    id: "o1-mini",
    name: "o1 Mini",
    provider: "openai",
    contextLength: 128000,
    pricing: { prompt: 3, completion: 12 },
    description: "Smaller reasoning model",
    supportsVision: false,
    supportsFunctions: false,
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
