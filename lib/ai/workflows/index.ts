/**
 * Workflows Module
 *
 * Durable workflow definitions for autonomous trading operations.
 *
 * Architecture:
 * - signalListenerWorkflow: Long-running, listens for market signals
 * - tradingAgentWorkflow: Per-signal execution, runs PredictionMarketAgent
 *
 * Durability:
 * - Workflow steps are durable (crash recovery, state persistence)
 * - PredictionMarketAgent inside runAgentStep is NOT durable
 * - Tools (especially placeOrder) fire once without retry
 */

export {
  tradingAgentWorkflow,
  type TradingInput,
  type TradingResult,
  type MarketSignal,
} from "./tradingAgent";

export {
  signalListenerWorkflow,
  type SignalListenerInput,
} from "./signalListener";
