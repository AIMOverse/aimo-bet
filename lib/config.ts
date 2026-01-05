/**
 * Unified configuration for Alpha Arena
 */

// =============================================================================
// Provider Types & Configuration
// =============================================================================

/**
 * Model provider configuration
 */
export interface ProviderConfig {
  /** Unique provider identifier */
  id: string;
  /** Display name */
  name: string;
  /** API base URL */
  baseUrl: string;
  /** Endpoint for fetching available models (if supported) */
  modelsEndpoint?: string;
  /** Environment variable key for API key */
  envKey: string;
}

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
  {
    id: "aimo",
    name: "AiMo Network",
    baseUrl: "https://beta.aimo.network",
    envKey: "AIMO_SIGNER_PRIVATE_KEY",
  },
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

// =============================================================================
// Default Values
// =============================================================================

/** Default model to use when none is selected */
export const DEFAULT_MODEL_ID =
  process.env.DEFAULT_MODEL ?? "openrouter/gpt-4o";

/** Default provider */
export const DEFAULT_PROVIDER_ID = "openrouter";

/** Default title for new chat sessions */
export const DEFAULT_SESSION_TITLE = "New Chat";

/** Maximum number of sessions to keep in localStorage */
export const MAX_LOCAL_SESSIONS = 100;

/** LocalStorage keys */
export const STORAGE_KEYS = {
  SESSIONS: "aimo-chat-sessions",
  MESSAGES_PREFIX: "aimo-chat-messages-",
  SETTINGS: "aimo-chat-settings",
} as const;

// =============================================================================
// Solana Configuration
// =============================================================================

/** Solana RPC URL for blockchain queries */
export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/** DFlow Prediction Markets API base URL */
export const DFLOW_METADATA_API_URL =
  process.env.DFLOW_METADATA_API_URL ||
  "https://prediction-markets-api.dflow.net";

// =============================================================================
// Arena Configuration
// =============================================================================

/** Default starting capital for new sessions */
export const DEFAULT_STARTING_CAPITAL = 100;

/** Polling intervals in milliseconds */
export const POLLING_INTERVALS = {
  performance: 30000, // 30 seconds
  trades: 10000, // 10 seconds
  broadcasts: 10000, // 10 seconds
  positions: 30000, // 30 seconds
  session: 60000, // 60 seconds
  prices: 5000, // 5 seconds (for REST polling)
} as const;

/** Market categories */
export const MARKET_CATEGORIES = [
  "Politics",
  "Economics",
  "Sports",
  "Entertainment",
  "Science",
  "Technology",
  "Weather",
  "Finance",
] as const;

/** Chart configuration */
export const CHART_CONFIG = {
  height: 500,
  margin: { top: 20, right: 30, left: 20, bottom: 5 },
  animationDuration: 300,
} as const;

/** Trade feed configuration */
export const TRADE_FEED_CONFIG = {
  pageSize: 20,
  maxItems: 100,
} as const;

/** Broadcast feed configuration */
export const BROADCAST_FEED_CONFIG = {
  pageSize: 20,
  maxItems: 50,
} as const;

// =============================================================================
// Trading Configuration
// =============================================================================

/** Configuration for autonomous trading loop */
export const TRADING_CONFIG = {
  // Swing detection thresholds
  swingThreshold: 0.05, // 5% price change triggers agents
  lookbackMinutes: 5, // Compare to price N minutes ago

  // Agent execution
  maxStepsPerAgent: 5, // Max tool calls per agent run

  // Risk limits (enforced in prompt, can add code checks)
  maxPositionPercent: 0.2, // Max 20% of portfolio per position
  minConfidence: 0.7, // Only trade with 70%+ conviction

  // Cooldowns
  minTimeBetweenRuns: 60, // Seconds between cron runs
} as const;
