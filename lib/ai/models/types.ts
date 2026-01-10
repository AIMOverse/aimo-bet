// =============================================================================
// Model Types
// =============================================================================

/**
 * AI model definition
 */
export interface ModelDefinition {
  /** Unique model identifier (e.g., "gpt-4o") */
  id: string;
  /** Display name */
  name: string;
  /** Provider identifier */
  provider: string;
  /** Maximum context window in tokens */
  contextLength: number;
  /** Pricing per 1M tokens */
  pricing: {
    prompt: number;
    completion: number;
  };
  /** Optional description */
  description?: string;
  /** Whether this model supports vision/images as input */
  supportsVision?: boolean;
  /** Whether this model supports function calling */
  supportsFunctions?: boolean;
  /**
   * Provider-specific model IDs.
   * Use when the same model has different IDs across providers.
   * Falls back to the canonical `id` if not specified.
   */
  providerIds?: {
    aimo?: string;
  };
  // Arena-specific fields (optional)
  /** Model series identifier for logo display (e.g., "openai", "claude", "gemini") */
  series?: string;
  /** Chart color for performance chart display */
  chartColor?: string;
  /** Solana wallet public address for on-chain trading */
  walletAddress?: string;
  /** Whether this model is enabled for arena trading */
  enabled?: boolean;
}

// ProviderConfig is now in lib/config.ts

/**
 * Model selection state
 */
export interface ModelState {
  /** Currently selected model ID */
  selectedModelId: string;
  /** Available models */
  models: ModelDefinition[];
  /** Whether models are being loaded */
  isLoading: boolean;
  /** Error message if loading failed */
  error: string | null;
}
