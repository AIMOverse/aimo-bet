"use workflow";

import { PredictionMarketAgent, type TradingResult } from "@/lib/ai/agents";
import { getWalletPrivateKey, getModelName } from "@/lib/ai/models/catalog";
import { getGlobalSession } from "@/lib/supabase/db";
import {
  getOrCreateAgentSession,
  recordAgentDecision,
  recordAgentTrade,
  upsertAgentPosition,
  updateAgentSessionValue,
} from "@/lib/supabase/agents";
import type { AgentSession } from "@/lib/supabase/types";

// ============================================================================
// Types
// ============================================================================

export interface TradingInput {
  modelId: string;
  walletAddress: string;
}

// Re-export TradingResult for consumers
export type { TradingResult };

// ============================================================================
// Trading Agent Workflow (Durable)
// ============================================================================

/**
 * Durable workflow that orchestrates the trading process.
 *
 * Architecture:
 * - Workflow layer is DURABLE (crash recovery, state persistence)
 * - PredictionMarketAgent inside runAgentStep is NOT DURABLE
 * - If agent fails mid-execution, the entire runAgentStep restarts
 * - Tools (especially placeOrder) fire once without retry to prevent duplicates
 *
 * KV Cache Optimization:
 * - Static system prompt (cacheable across runs)
 * - Agent fetches balance via getBalance tool (appends to cache, doesn't invalidate)
 * - No dynamic user prompt with balance/signals
 *
 * Data Flow:
 * - Agent's getBalance tool: Single RPC call for USDC balance
 * - Agent's retrievePosition tool: Uses dflow API (on-chain truth for trading decisions)
 * - UI hooks: Use Supabase (recorded data for display)
 *
 * Recording:
 * - All results written atomically to Supabase:
 *   → agent_decisions
 *   → agent_trades
 *   → agent_positions (upsert)
 *   → agent_sessions (update value)
 */
export async function tradingAgentWorkflow(
  input: TradingInput
): Promise<TradingResult> {
  console.log(`[tradingAgent:${input.modelId}] Starting trading workflow`);

  try {
    // Step 1: Get session (durable)
    const session = await getSessionStep();

    // Step 2: Get or create agent session (durable)
    const agentSession = await getAgentSessionStep(
      session.id,
      input.modelId,
      input.walletAddress
    );

    // Step 3: Run AI agent (durable wrapper, agent inside is NOT durable)
    // Agent fetches balance via getBalance tool (KV cache friendly)
    // Agent's retrievePosition tool uses dflow API (on-chain truth)
    const result = await runAgentStep(input);

    // Step 4: Record all results atomically
    // (decision + trades + positions + session value)
    await recordResultsStep(agentSession, result);

    console.log(
      `[tradingAgent:${input.modelId}] Completed: ${result.decision}, ${result.trades.length} trades`
    );

    return result;
  } catch (error) {
    console.error(`[tradingAgent:${input.modelId}] Error:`, error);
    throw error;
  }
}

// ============================================================================
// Durable Step Functions
// ============================================================================

/**
 * Get the global trading session.
 * Durable: Session state is critical for tracking.
 */
async function getSessionStep() {
  "use step";
  return await getGlobalSession();
}

/**
 * Get or create an agent session for this model.
 * Durable: Must have agent context for recording decisions.
 */
async function getAgentSessionStep(
  sessionId: string,
  modelId: string,
  walletAddress: string
): Promise<AgentSession> {
  "use step";
  const modelName = getModelName(modelId) || modelId;
  return await getOrCreateAgentSession(
    sessionId,
    modelId,
    modelName,
    walletAddress
  );
}

/**
 * Run the PredictionMarketAgent.
 *
 * Durable wrapper: If this step fails, it restarts from the beginning.
 * Agent inside is NOT durable: Tools fire once without retry.
 * Agent tools use dflow API for on-chain data (not Supabase).
 *
 * KV Cache Optimization:
 * - Static system prompt is cacheable across runs
 * - Agent fetches balance via getBalance tool (appends to cache)
 *
 * IMPORTANT: placeOrder tool executes once - retrying would create duplicate orders.
 */
async function runAgentStep(input: TradingInput): Promise<TradingResult> {
  "use step";

  // Create agent with wallet context
  // maxSteps: 5 limits LLM roundtrips (each step = 1 LLM call + tool executions)
  const agent = new PredictionMarketAgent({
    modelId: input.modelId,
    walletAddress: input.walletAddress,
    privateKey: getWalletPrivateKey(input.modelId),
    maxSteps: 10,
  });

  // Run the agent with minimal input (KV cache friendly)
  // Agent will call getBalance tool to fetch current balance
  return await agent.run({});
}

/**
 * Record all results to database in one step.
 * Updates: agent_decisions, agent_trades, agent_positions, agent_sessions
 * Durable: Database writes must complete for data integrity.
 * Triggers Supabase Realtime → UI updates.
 */
async function recordResultsStep(
  agentSession: AgentSession,
  result: TradingResult
): Promise<void> {
  "use step";

  // 1. Record the decision
  const decision = await recordAgentDecision({
    agentSessionId: agentSession.id,
    triggerType: "periodic",
    triggerDetails: {},
    marketTicker: result.marketTicker,
    marketTitle: result.marketTitle,
    decision: result.decision,
    reasoning: result.reasoning,
    confidence: result.confidence,
    portfolioValueAfter: result.portfolioValue,
  });

  console.log(
    `[tradingAgent] Recorded decision: ${result.decision} (id: ${decision.id})`
  );

  // 2. Record trades + update positions
  for (const trade of result.trades) {
    // Record trade
    await recordAgentTrade({
      decisionId: decision.id,
      agentSessionId: agentSession.id,
      marketTicker: trade.marketTicker,
      marketTitle: trade.marketTitle,
      side: trade.side,
      action: trade.action,
      quantity: trade.quantity,
      price: trade.price,
      notional: trade.notional,
      txSignature: trade.id,
    });

    // Update position (delta-based)
    // Buy increases quantity, sell/redeem decreases
    const quantityDelta =
      trade.action === "buy" ? trade.quantity : -trade.quantity;

    await upsertAgentPosition({
      agentSessionId: agentSession.id,
      marketTicker: trade.marketTicker,
      marketTitle: trade.marketTitle,
      side: trade.side,
      mint: trade.mint || "",
      quantityDelta,
      price: trade.price,
    });
  }

  // 3. Update agent session value for leaderboard
  const portfolioValue = result.portfolioValue || 0;
  await updateAgentSessionValue(
    agentSession.id,
    portfolioValue,
    portfolioValue - agentSession.startingCapital
  );
}
