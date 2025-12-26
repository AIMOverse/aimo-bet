/**
 * Guardrails Types
 *
 * Type definitions for risk management and trade validation
 */

/**
 * Risk limits configuration for trading agents
 */
export interface RiskLimits {
  /** Max percentage of portfolio for single position (e.g., 0.20 = 20%) */
  maxSinglePosition: number;

  /** Max total exposure as percentage of portfolio (e.g., 0.80 = 80%) */
  maxTotalExposure: number;

  /** Max daily loss before halting (e.g., 0.05 = 5%) */
  maxDailyLoss: number;

  /** Max trade size in dollars */
  maxTradeSize: number;

  /** Minimum confidence required to trade (e.g., 0.70 = 70%) */
  minConfidence: number;
}

/**
 * Result of trade validation
 */
export interface TradeValidationResult {
  /** Whether the trade is approved */
  approved: boolean;
  /** Reason for rejection if not approved */
  reason?: string;
  /** Suggested adjusted size if original was too large */
  adjustedSize?: number;
}

/**
 * Current portfolio state for risk calculations
 */
export interface PortfolioState {
  /** Available cash balance */
  availableBalance: number;
  /** Total portfolio value (cash + positions) */
  totalValue: number;
  /** Current positions */
  positions: {
    marketId: string;
    value: number;
  }[];
  /** Today's realized P&L */
  todayPnL: number;
}
