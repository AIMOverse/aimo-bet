/**
 * Workflows Module
 *
 * Durable workflow definitions for autonomous trading operations.
 *
 * Architecture:
 * - Agents are STATELESS - no long-running listeners
 * - tradingAgentWorkflow: Triggered by cron jobs or manual triggers
 * - Each trigger starts a fresh workflow run
 *
 * KV Cache Optimization:
 * - Static system prompt (cacheable across runs)
 * - Agent fetches balance via getBalance tool (appends to cache)
 * - No dynamic user prompt with balance/signals
 *
 * Durability:
 * - Workflow steps are durable (crash recovery, state persistence)
 * - PredictionMarketAgent inside runAgentStep is NOT durable
 * - Tools (especially placeOrder) fire once without retry
 *
 * Trigger Sources:
 * - Cron jobs for periodic analysis
 * - Manual triggers via /api/agents/trigger
 */

export {
  tradingAgentWorkflow,
  type TradingInput,
  type TradingResult,
} from "./tradingAgent";
