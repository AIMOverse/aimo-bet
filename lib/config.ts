/**
 * Unified configuration for Alpha Arena
 */

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
// Polygon Configuration
// =============================================================================

/** Polygon RPC URL for EVM queries */
export const POLYGON_RPC_URL =
  process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";

/** USDC.e contract address on Polygon (bridged USDC, 6 decimals) */
export const POLYGON_USDC_ADDRESS =
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

// =============================================================================
// Arena Configuration
// =============================================================================

/**
 * Global Arena Session ID - Fixed UUID for the single global session.
 * All agent data is linked to this session.
 */
export const GLOBAL_SESSION_ID = "00000000-0000-0000-0000-000000000001";

/** Default starting capital for new sessions */
export const DEFAULT_STARTING_CAPITAL = 100;

/** Chart configuration */
export const CHART_CONFIG = {
  height: 500,
  margin: { top: 20, right: 30, left: 20, bottom: 5 },
  animationDuration: 300,
} as const;

// =============================================================================
// Parallel AI Configuration
// =============================================================================

/** Parallel AI API key */
export const PARALLEL_API_KEY = process.env.PARALLEL_API_KEY;

/** Parallel AI API base URL */
export const PARALLEL_API_URL = "https://api.parallel.ai";

/** Parallel webhook secret for verifying incoming webhooks */
export const PARALLEL_WEBHOOK_SECRET = process.env.PARALLEL_WEBHOOK_SECRET;

/** Base URL for webhooks */
const WEBHOOK_BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

/** Webhook URL for Task API callbacks */
export const PARALLEL_TASK_WEBHOOK_URL = `${WEBHOOK_BASE_URL}/api/parallel/task/webhook`;

/** Webhook URL for Monitor API callbacks */
export const PARALLEL_MONITOR_WEBHOOK_URL = `${WEBHOOK_BASE_URL}/api/parallel/monitor/webhook`;

// =============================================================================
// Trading Configuration
// =============================================================================

/** Configuration for autonomous trading loop */
export const TRADING_CONFIG = {
  // Swing detection thresholds
  swingThreshold: 0.05, // 5% price change triggers agents
  lookbackMinutes: 5, // Compare to price N minutes ago

  // Agent execution
  maxStepsPerAgent: 15, // Max tool calls per agent run

  // Risk limits (enforced in prompt, can add code checks)
  maxPositionPercent: 0.2, // Max 20% of portfolio per position
  minConfidence: 0.7, // Only trade with 70%+ conviction

  // Cooldowns
  minTimeBetweenRuns: 60, // Seconds between cron runs
} as const;
