/**
 * Risk Limits Validation
 *
 * Pre-trade validation to enforce risk management rules
 */

import { TRADING_CONFIG } from "@/lib/config";
import type {
  RiskLimits,
  TradeValidationResult,
  PortfolioState,
} from "./types";

/**
 * Default risk limits based on trading configuration
 */
const DEFAULT_LIMITS: RiskLimits = {
  maxSinglePosition: TRADING_CONFIG.maxPositionPercent,
  maxTotalExposure: 0.8,
  maxDailyLoss: 0.05,
  maxTradeSize: 100, // $100 max per trade
  minConfidence: TRADING_CONFIG.minConfidence,
};

/**
 * Validate a trade against risk limits
 *
 * @param tradeSize - Size of the proposed trade in dollars
 * @param marketId - Market identifier for position checking
 * @param portfolio - Current portfolio state
 * @param limits - Risk limits to apply (defaults to DEFAULT_LIMITS)
 * @returns Validation result with approval status and reason
 */
export function validateTrade(
  tradeSize: number,
  marketId: string,
  portfolio: PortfolioState,
  limits: RiskLimits = DEFAULT_LIMITS
): TradeValidationResult {
  // Check absolute trade size limit
  if (tradeSize > limits.maxTradeSize) {
    return {
      approved: false,
      reason: `Exceeds max trade size ($${limits.maxTradeSize})`,
      adjustedSize: limits.maxTradeSize,
    };
  }

  // Check single position limit
  const positionRatio = tradeSize / portfolio.totalValue;
  if (positionRatio > limits.maxSinglePosition) {
    const adjustedSize = portfolio.totalValue * limits.maxSinglePosition;
    return {
      approved: false,
      reason: `Exceeds single position limit (${(limits.maxSinglePosition * 100).toFixed(0)}%)`,
      adjustedSize: Math.min(adjustedSize, limits.maxTradeSize),
    };
  }

  // Check total exposure
  const currentExposure = portfolio.positions.reduce(
    (sum, p) => sum + p.value,
    0
  );
  const newExposure = currentExposure + tradeSize;
  if (newExposure / portfolio.totalValue > limits.maxTotalExposure) {
    return {
      approved: false,
      reason: `Exceeds total exposure limit (${(limits.maxTotalExposure * 100).toFixed(0)}%)`,
    };
  }

  // Check daily loss limit
  if (portfolio.todayPnL / portfolio.totalValue < -limits.maxDailyLoss) {
    return {
      approved: false,
      reason: `Daily loss limit reached (${(limits.maxDailyLoss * 100).toFixed(0)}%)`,
    };
  }

  // Check available balance
  if (tradeSize > portfolio.availableBalance) {
    return {
      approved: false,
      reason: `Insufficient balance (available: $${portfolio.availableBalance.toFixed(2)})`,
      adjustedSize: portfolio.availableBalance,
    };
  }

  return { approved: true };
}

/**
 * Get the default risk limits
 */
export function getDefaultLimits(): RiskLimits {
  return { ...DEFAULT_LIMITS };
}
