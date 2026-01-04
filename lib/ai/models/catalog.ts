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
  // GPT-5.2 - Default model
  {
    id: "openrouter/openai/gpt-5.2",
    name: "GPT-5.2",
    provider: "openrouter",
    contextLength: 128000,
    pricing: { prompt: 1.75, completion: 14 },
    description: "OpenAI's most capable model",
    supportsVision: true,
    supportsFunctions: true,
    // Arena config
    series: "openai",
    chartColor: "#10b981", // Emerald
    walletAddress: process.env.WALLET_GPT_PUBLIC,
    enabled: true,
  },
  // Gemini 3 Pro Preview
  {
    id: "openrouter/google/gemini-3-pro-preview",
    name: "Gemini 3 Pro",
    provider: "openrouter",
    contextLength: 1000000,
    pricing: { prompt: 4, completion: 18 },
    description:
      "Gemini 3 Pro is Google's flagship frontier model for high-precision multimodal reasoning, combining strong performance across text, image, video, audio, and code with a 1M-token context window.",
    supportsVision: true,
    supportsFunctions: true,
    // Arena config
    series: "gemini",
    chartColor: "#22c55e", // Green
    walletAddress: process.env.WALLET_GEMINI_PUBLIC,
    enabled: true,
  },
  // Grok 4
  {
    id: "openrouter/x-ai/grok-4",
    name: "Grok 4",
    provider: "openrouter",
    contextLength: 256000,
    pricing: { prompt: 3, completion: 15 },
    description:
      "Grok 4 is xAI's latest reasoning model with a 256k context window.",
    supportsVision: true,
    supportsFunctions: true,
    // Arena config
    series: "grok",
    chartColor: "#f97316", // Orange
    walletAddress: process.env.WALLET_GROK_PUBLIC,
    enabled: true,
  },
  // DeepSeek V3.2 (Test)
  {
    id: "openrouter/deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "openrouter",
    contextLength: 64000,
    pricing: { prompt: 0.14, completion: 0.28 },
    description:
      "DeepSeek-V3.2 is a large language model designed to harmonize high computational efficiency with strong reasoning and agentic tool-use performance.",
    supportsVision: false,
    supportsFunctions: true,
    // Arena config
    series: "deepseek",
    chartColor: "#a78bfa", // Light violet
    walletAddress: process.env.WALLET_DEEPSEEK_PUBLIC,
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
 * Get model display name by ID
 */
export function getModelName(id: string): string | undefined {
  return MODELS.find((m) => m.id === id)?.name;
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
  shortId: string
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
  "openrouter/openai/gpt-5.2": process.env.WALLET_GPT_PRIVATE,
  // "openrouter/gpt-4o-mini": process.env.WALLET_GPT4O_MINI_PRIVATE,
  // "openrouter/claude-sonnet-4": process.env.WALLET_CLAUDE_SONNET_PRIVATE,
  // "openrouter/claude-3.5-haiku": process.env.WALLET_CLAUDE_HAIKU_PRIVATE,
  "openrouter/google/gemini-3-pro-preview": process.env.WALLET_GEMINI_PRIVATE,
  // "openrouter/deepseek-chat": process.env.WALLET_DEEPSEEK_PRIVATE,
  "openrouter/x-ai/grok-4": process.env.WALLET_GROK_PRIVATE,
  "openrouter/deepseek/deepseek-v3.2": process.env.WALLET_DEEPSEEK_PRIVATE,
};

/**
 * Get wallet private key for a model (for transaction signing).
 * Private keys are stored in environment variables and never exposed to client.
 */
export function getWalletPrivateKey(modelId: string): string | undefined {
  return WALLET_PRIVATE_KEY_MAP[modelId];
}
