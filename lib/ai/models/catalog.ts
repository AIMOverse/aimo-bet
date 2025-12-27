import type { ModelDefinition } from "./types";

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
    series: "openai",
    chartColor: "#10b981", // Emerald
    walletAddress: process.env.WALLET_GPT4O_PUBLIC,
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
    series: "openai",
    chartColor: "#22c55e", // Green
    walletAddress: process.env.WALLET_GPT4O_MINI_PUBLIC,
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
    series: "claude",
    chartColor: "#f97316", // Orange
    walletAddress: process.env.WALLET_CLAUDE_SONNET_PUBLIC,
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
    series: "claude",
    chartColor: "#fb923c", // Amber
    walletAddress: process.env.WALLET_CLAUDE_HAIKU_PUBLIC,
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
    series: "gemini",
    chartColor: "#3b82f6", // Blue
    walletAddress: process.env.WALLET_GEMINI_FLASH_PUBLIC,
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
    series: "deepseek",
    chartColor: "#8b5cf6", // Violet
    walletAddress: process.env.WALLET_DEEPSEEK_PUBLIC,
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
    series: "llama",
    chartColor: "#ec4899", // Pink
    walletAddress: process.env.WALLET_LLAMA_PUBLIC,
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
    series: "mistral",
    chartColor: "#06b6d4", // Cyan
    walletAddress: process.env.WALLET_MISTRAL_PUBLIC,
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
 * Get model series by model name
 */
export function getModelSeries(modelName: string): string | undefined {
  const model = MODELS.find((m) => m.name === modelName);
  return model?.series;
}

/**
 * Get series logo path for a model
 * Returns the path to the series logo SVG, or undefined if no series is set
 */
export function getSeriesLogoPath(modelName: string): string | undefined {
  const series = getModelSeries(modelName);
  if (!series) return undefined;

  // Map series to logo filename
  const logoMap: Record<string, string> = {
    openai: "openai.svg",
    claude: "claude-color.svg",
    gemini: "gemini-color.svg",
    deepseek: "deepseek-color.svg",
    llama: "llama-color.svg",
    mistral: "mistral-color.svg",
    qwen: "qwen-color.svg",
    grok: "grok.svg",
    kimi: "kimi-color.svg",
    zai: "zai.svg",
  };

  const filename = logoMap[series];
  return filename ? `/model-series/${filename}` : undefined;
}

/**
 * Create a map of model name to series info (series id and logo path)
 */
export function getModelSeriesMap(): Map<
  string,
  { series: string; logoPath: string }
> {
  const map = new Map<string, { series: string; logoPath: string }>();
  MODELS.forEach((model) => {
    if (model.series) {
      const logoPath = getSeriesLogoPath(model.name);
      if (logoPath) {
        map.set(model.name, { series: model.series, logoPath });
      }
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

/**
 * Wallet private key environment variable mapping.
 * Maps model ID to corresponding private key env var.
 */
const WALLET_PRIVATE_KEY_MAP: Record<string, string | undefined> = {
  "openrouter/gpt-4o": process.env.WALLET_GPT4O_PRIVATE,
  "openrouter/gpt-4o-mini": process.env.WALLET_GPT4O_MINI_PRIVATE,
  "openrouter/claude-sonnet-4": process.env.WALLET_CLAUDE_SONNET_PRIVATE,
  "openrouter/claude-3.5-haiku": process.env.WALLET_CLAUDE_HAIKU_PRIVATE,
  "openrouter/gemini-2.0-flash": process.env.WALLET_GEMINI_FLASH_PRIVATE,
  "openrouter/deepseek-chat": process.env.WALLET_DEEPSEEK_PRIVATE,
  "openrouter/llama-3.3-70b": process.env.WALLET_LLAMA_PRIVATE,
  "openrouter/mistral-large": process.env.WALLET_MISTRAL_PRIVATE,
};

/**
 * Get wallet private key for a model (for transaction signing).
 * Private keys are stored in environment variables and never exposed to client.
 */
export function getWalletPrivateKey(modelId: string): string | undefined {
  return WALLET_PRIVATE_KEY_MAP[modelId];
}
