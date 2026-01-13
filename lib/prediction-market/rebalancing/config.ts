/**
 * Cross-chain rebalancing configuration constants
 * Uses lower thresholds in development to allow testing with small balances
 */
const isDev = process.env.NODE_ENV === "development";

export const REBALANCE_CONFIG = {
  /** Minimum USDC.e balance on Polygon for Polymarket trading */
  POLYGON_MIN_BALANCE: isDev ? 2 : 10,

  /** Reserved USDC on Solana for inference costs (untouchable) */
  SOLANA_RESERVE: isDev ? 1 : 10,

  /** Amount to bridge when rebalancing */
  BRIDGE_AMOUNT: isDev ? 2 : 10,

  /** TTL for pending bridge flag (ms) */
  PENDING_BRIDGE_TTL: 35 * 60 * 1000, // 35 minutes
} as const;
