/**
 * Cross-chain rebalancing configuration constants
 */
export const REBALANCE_CONFIG = {
  /** Minimum USDC.e balance on Polygon for Polymarket trading */
  POLYGON_MIN_BALANCE: 10,

  /** Reserved USDC on Solana for inference costs (untouchable) */
  SOLANA_RESERVE: 10,

  /** Amount to bridge when rebalancing */
  BRIDGE_AMOUNT: 10,

  /** TTL for pending bridge flag (ms) */
  PENDING_BRIDGE_TTL: 35 * 60 * 1000, // 35 minutes
} as const;
