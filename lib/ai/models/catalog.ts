import type { ModelDefinition } from "./types";

// ============================================================================
// Model Catalog - Season 0
// ============================================================================

/**
 * Arena models available for trading in Season 0.
 * All models use the aimo-network provider.
 * Arena-specific fields (chartColor, walletAddress, enabled) configure trading behavior.
 * Wallet private keys are stored in environment variables (WALLET_<SERIES>_PRIVATE).
 */
export const MODELS: ModelDefinition[] = [
  // OpenAI - GPT-5.2
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    provider: "aimo-network",
    contextLength: 128000,
    pricing: { prompt: 1.75, completion: 14 },
    description: "OpenAI's most capable model",
    supportsVision: true,
    supportsFunctions: true,
    providerIds: {
      aimo: "GL9JtU2u8uo4XFrGrZg2KySxstdsQS2UcbZAwgtR3Rhq:openai/gpt-5",
    },
    series: "gpt",
    chartColor: "#10b981", // Emerald
    walletAddress: process.env.WALLET_GPT_SVM_PUBLIC,
    enabled: true,
  },
  // Claude - claude-sonnet-4.5
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "aimo-network",
    contextLength: 200000,
    pricing: { prompt: 3, completion: 15 },
    description: "Anthropic's balanced model with strong reasoning",
    supportsVision: true,
    supportsFunctions: true,
    providerIds: {
      aimo: "9D9ZcNGUSDCfiDQ4DcGvvF1de5s9cqZuE5T7KcWFSgV6:anthropic/claude-sonnet-4.5",
    },
    series: "claude",
    chartColor: "#f97316", // Orange
    walletAddress: process.env.WALLET_CLAUDE_SVM_PUBLIC,
    enabled: true,
  },
  // DeepSeek - deepseek-v3.2
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "aimo-network",
    contextLength: 64000,
    pricing: { prompt: 0.14, completion: 0.28 },
    description:
      "DeepSeek-V3.2 harmonizes high computational efficiency with strong reasoning",
    supportsVision: false,
    supportsFunctions: true,
    providerIds: {
      aimo: "47bztUnCFpGYXWw5hCu7esJExSVRsK2Ww3Y5y8mMk7cY:deepseek/deepseek-v3.2-exp",
    },
    series: "deepseek",
    chartColor: "#a78bfa", // Light violet
    walletAddress: process.env.WALLET_DEEPSEEK_SVM_PUBLIC,
    enabled: true,
  },
  // GLM - glm-4.7
  {
    id: "z-ai/glm-4.6",
    name: "GLM-4.7",
    provider: "aimo-network",
    contextLength: 128000,
    pricing: { prompt: 0.5, completion: 1 },
    description: "Zhipu AI's latest GLM model with strong multilingual support",
    supportsVision: true,
    supportsFunctions: true,
    providerIds: {
      aimo: "GL9JtU2u8uo4XFrGrZg2KySxstdsQS2UcbZAwgtR3Rhq:z-ai/glm-4.6",
    },
    series: "glm",
    chartColor: "#06b6d4", // Cyan
    walletAddress: process.env.WALLET_GLM_SVM_PUBLIC,
    enabled: true,
  },
  // Grok - grok-4
  {
    id: "xai/grok-4",
    name: "Grok 4",
    provider: "aimo-network",
    contextLength: 256000,
    pricing: { prompt: 3, completion: 15 },
    description: "xAI's latest reasoning model with a 256k context window",
    supportsVision: true,
    supportsFunctions: true,
    providerIds: {
      aimo: "9D9ZcNGUSDCfiDQ4DcGvvF1de5s9cqZuE5T7KcWFSgV6:xai/grok-4",
    },
    series: "grok",
    chartColor: "#ef4444", // Red
    walletAddress: process.env.WALLET_GROK_SVM_PUBLIC,
    enabled: true,
  },
  // Qwen - qwen-3-max
  {
    id: "qwen/qwen3-max",
    name: "Qwen 3 Max",
    provider: "aimo-network",
    contextLength: 128000,
    pricing: { prompt: 0.4, completion: 1.2 },
    description: "Alibaba's most capable Qwen model",
    supportsVision: true,
    supportsFunctions: true,
    providerIds: {
      aimo: "47bztUnCFpGYXWw5hCu7esJExSVRsK2Ww3Y5y8mMk7cY:alibaba/qwen3-max",
    },
    series: "qwen",
    chartColor: "#8b5cf6", // Violet
    walletAddress: process.env.WALLET_QWEN_SVM_PUBLIC,
    enabled: true,
  },
  // Gemini - gemini-3-pro
  {
    id: "google/gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "aimo-network",
    contextLength: 1000000,
    pricing: { prompt: 4, completion: 18 },
    description:
      "Google's flagship frontier model for high-precision multimodal reasoning",
    supportsVision: true,
    supportsFunctions: true,
    providerIds: {
      aimo: "GL9JtU2u8uo4XFrGrZg2KySxstdsQS2UcbZAwgtR3Rhq:google/gemini-3-pro",
    },
    aimoSdkProvider: "google",
    series: "gemini",
    chartColor: "#22c55e", // Green
    walletAddress: process.env.WALLET_GEMINI_SVM_PUBLIC,
    enabled: true,
  },
  // Kimi - kimi-k2-0905
  {
    id: "moonshotai/kimi-k2-0905",
    name: "Kimi K2",
    provider: "aimo-network",
    contextLength: 128000,
    pricing: { prompt: 0.6, completion: 1.8 },
    description: "Moonshot AI's Kimi model with strong reasoning capabilities",
    supportsVision: true,
    supportsFunctions: true,
    providerIds: {
      aimo: "47bztUnCFpGYXWw5hCu7esJExSVRsK2Ww3Y5y8mMk7cY:moonshot/kimi-k2",
    },
    series: "kimi",
    chartColor: "#ec4899", // Pink
    walletAddress: process.env.WALLET_KIMI_SVM_PUBLIC,
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
 * Get a specific arena model by short ID (e.g., "gpt-5.2" instead of "openai/gpt-5.2")
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
    qwen: "qwen-color.svg",
    grok: "grok.svg",
    kimi: "kimi-color.svg",
    glm: "zai.svg",
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
 * NOTE: These must match the canonical model IDs in the MODELS array (the `id` field).
 * Uses the same SVM private keys as the aimo-network provider (registry.ts).
 */
const WALLET_PRIVATE_KEY_MAP: Record<string, string | undefined> = {
  "openai/gpt-5": process.env.WALLET_GPT_SVM_PRIVATE,
  "anthropic/claude-sonnet-4.5": process.env.WALLET_CLAUDE_SVM_PRIVATE,
  "deepseek/deepseek-v3.2": process.env.WALLET_DEEPSEEK_SVM_PRIVATE,
  "z-ai/glm-4.6": process.env.WALLET_GLM_SVM_PRIVATE,
  "xai/grok-4": process.env.WALLET_GROK_SVM_PRIVATE,
  "qwen/qwen3-max": process.env.WALLET_QWEN_SVM_PRIVATE,
  "google/gemini-3-pro": process.env.WALLET_GEMINI_SVM_PRIVATE,
  "moonshotai/kimi-k2-0905": process.env.WALLET_KIMI_SVM_PRIVATE,
};

/**
 * Get wallet private key for a model (for transaction signing).
 * Private keys are stored in environment variables and never exposed to client.
 */
export function getWalletPrivateKey(modelId: string): string | undefined {
  const privateKey = WALLET_PRIVATE_KEY_MAP[modelId];
  if (!privateKey) {
    console.warn(
      `[Catalog] No private key found for model "${modelId}". Available keys: ${Object.keys(
        WALLET_PRIVATE_KEY_MAP
      ).join(", ")}`
    );
  }
  return privateKey;
}
