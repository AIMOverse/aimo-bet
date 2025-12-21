import type { ModelDefinition, ProviderConfig } from "@/types/models";

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * API provider configurations
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsEndpoint: "/models",
    envKey: "OPENROUTER_API_KEY",
  },
  // Future providers can be added here
];

/**
 * Get provider by ID
 */
export function getProviderById(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Get default provider
 */
export function getDefaultProvider(): ProviderConfig {
  return PROVIDERS[0];
}

// ============================================================================
// Model Catalog
// ============================================================================

/**
 * OpenRouter models available for chat
 */
export const MODELS: ModelDefinition[] = [
  // GPT-4o - Default model
  {
    id: "openrouter/gpt-4o",
    name: "GPT-4o",
    provider: "openrouter",
    contextLength: 128000,
    pricing: { prompt: 2.5, completion: 10 },
    description: "OpenAI's most capable model",
    supportsVision: true,
    supportsFunctions: true,
    outputModalities: ["text"],
  },
  // GPT-4o Mini
  {
    id: "openrouter/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openrouter",
    contextLength: 128000,
    pricing: { prompt: 0.15, completion: 0.6 },
    description: "Fast and affordable GPT-4o variant",
    supportsVision: true,
    supportsFunctions: true,
    outputModalities: ["text"],
  },
  // Claude Sonnet 4
  {
    id: "openrouter/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "openrouter",
    contextLength: 200000,
    pricing: { prompt: 3, completion: 15 },
    description: "Anthropic's balanced model for most tasks",
    supportsVision: true,
    supportsFunctions: true,
    outputModalities: ["text"],
  },
  // Claude 3.5 Haiku
  {
    id: "openrouter/claude-3.5-haiku",
    name: "Claude 3.5 Haiku",
    provider: "openrouter",
    contextLength: 200000,
    pricing: { prompt: 0.8, completion: 4 },
    description: "Fast and efficient Claude model",
    supportsVision: true,
    supportsFunctions: true,
    outputModalities: ["text"],
  },
  // Gemini 2.0 Flash
  {
    id: "openrouter/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "openrouter",
    contextLength: 1000000,
    pricing: { prompt: 0.1, completion: 0.4 },
    description: "Google's fast multimodal model",
    supportsVision: true,
    supportsFunctions: true,
    outputModalities: ["text"],
  },
  // DeepSeek Chat
  {
    id: "openrouter/deepseek-chat",
    name: "DeepSeek Chat",
    provider: "openrouter",
    contextLength: 64000,
    pricing: { prompt: 0.14, completion: 0.28 },
    description: "Powerful and cost-effective model",
    supportsVision: false,
    supportsFunctions: true,
    outputModalities: ["text"],
  },
  // Llama 3.3 70B
  {
    id: "openrouter/llama-3.3-70b",
    name: "Llama 3.3 70B",
    provider: "openrouter",
    contextLength: 128000,
    pricing: { prompt: 0.12, completion: 0.3 },
    description: "Meta's open-source flagship model",
    supportsVision: false,
    supportsFunctions: true,
    outputModalities: ["text"],
  },
  // Mistral Large
  {
    id: "openrouter/mistral-large",
    name: "Mistral Large",
    provider: "openrouter",
    contextLength: 128000,
    pricing: { prompt: 2, completion: 6 },
    description: "Mistral's most capable model",
    supportsVision: false,
    supportsFunctions: true,
    outputModalities: ["text"],
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
