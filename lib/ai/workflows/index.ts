/**
 * Workflows Module
 *
 * Durable workflow definitions for autonomous trading operations.
 *
 * Architecture:
 * - Agents are STATELESS - no long-running listeners
 * - tradingAgentWorkflow: Triggered by market signals or cron jobs
 * - Each trigger starts a fresh workflow run
 *
 * Durability:
 * - Workflow steps are durable (crash recovery, state persistence)
 * - PredictionMarketAgent inside runAgentStep is NOT durable
 * - Tools (especially placeOrder) fire once without retry
 *
 * Trigger Sources:
 * - Market signals from PartyKit (price swings, volume spikes, etc.)
 * - Cron jobs for periodic analysis
 * - Manual triggers via /api/agents/trigger
 */

export {
  tradingAgentWorkflow,
  type TradingInput,
  type TradingResult,
  type MarketSignal,
} from "./tradingAgent";
