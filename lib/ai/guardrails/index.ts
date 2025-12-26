/**
 * Guardrails Module
 *
 * Risk control and validation for trading agents.
 * Includes both business-level trade validation and LLM-level middleware.
 */

// Types
export * from "./types";

// Trade validation
export { validateTrade, getDefaultLimits } from "./riskLimits";

// LLM middleware
export {
  createTradingMiddleware,
  createTradingMiddlewareFactory,
  DEFAULT_TRADING_MIDDLEWARE_CONFIG,
} from "./middleware";
