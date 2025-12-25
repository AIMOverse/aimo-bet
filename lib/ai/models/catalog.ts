import type { ModelDefinition } from "@/types/models";

// ============================================================================
// Model Catalog
// ============================================================================

/**
 * OpenRouter models available for chat and arena trading.
 * Arena-specific fields (chartColor, walletAddress, enabled) configure trading behavior.
 * Wallet private keys are stored in environment variables (ARENA_WALLET_<MODEL_KEY>).
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
    // Arena config
    chartColor: "#10b981", // Emerald
    enabled: true,
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
    // Arena config
    chartColor: "#22c55e", // Green
    enabled: true,
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
    // Arena config
    chartColor: "#f97316", // Orange
    enabled: true,
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
    // Arena config
    chartColor: "#fb923c", // Amber
    enabled: true,
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
    // Arena config
    chartColor: "#3b82f6", // Blue
    enabled: true,
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
    // Arena config
    chartColor: "#8b5cf6", // Violet
    enabled: true,
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
    // Arena config
    chartColor: "#ec4899", // Pink
    enabled: true,
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
    // Arena config
    chartColor: "#06b6d4", // Cyan
    enabled: true,
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

// ============================================================================
// Arena-specific Model Functions
// ============================================================================

/**
 * Default chart color for models without a specific color
 */
export const DEFAULT_CHART_COLOR = "#6366f1"; // Indigo

/**
 * Get all arena models (optionally filter by enabled status)
 */
export function getArenaModels(enabledOnly = true): ModelDefinition[] {
  if (enabledOnly) {
    return MODELS.filter((m) => m.enabled);
  }
  return MODELS;
}

/**
 * Get a specific arena model by ID
 */
export function getArenaModel(id: string): ModelDefinition | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * Get a specific arena model by short ID (e.g., "gpt-4o" instead of "openrouter/gpt-4o")
 */
export function getArenaModelByShortId(
  shortId: string,
): ModelDefinition | undefined {
  return MODELS.find((m) => m.id.endsWith(`/${shortId}`) || m.id === shortId);
}

/**
 * Get model color by name (for chart display)
 */
export function getModelColor(modelName: string): string {
  const model = MODELS.find((m) => m.name === modelName);
  return model?.chartColor ?? DEFAULT_CHART_COLOR;
}

/**
 * Create a map of model name to color
 */
export function getModelColorMap(): Map<string, string> {
  const map = new Map<string, string>();
  MODELS.forEach((model) => {
    if (model.chartColor) {
      map.set(model.name, model.chartColor);
    }
  });
  return map;
}

/**
 * Get models with wallet addresses configured
 */
export function getModelsWithWallets(): ModelDefinition[] {
  return MODELS.filter((m) => m.enabled && m.walletAddress);
}
