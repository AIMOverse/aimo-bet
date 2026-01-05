"use workflow";

import {
  PredictionMarketAgent,
  type TradingResult,
  type MarketSignal,
} from "@/lib/ai/agents";
import { getWalletPrivateKey, getModelName } from "@/lib/ai/models/catalog";
import { getGlobalSession } from "@/lib/supabase/db";
import {
  getOrCreateAgentSession,
  recordAgentDecision,
  recordAgentTrade,
  upsertAgentPosition,
  updateAgentSessionValue,
} from "@/lib/supabase/agents";
import type { AgentSession, TriggerType } from "@/lib/supabase/types";
import { getCurrencyBalance } from "@/lib/solana/client";

// ============================================================================
// Types
// ============================================================================

export interface TradingInput {
  modelId: string;
  walletAddress: string;
  signal?: MarketSignal;
  /** When true, uses test prompt that forces a $1-5 trade */
  testMode?: boolean;
}

// Re-export TradingResult for consumers
export type { TradingResult, MarketSignal };

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
 * Data Flow:
 * - Agent's retrievePosition tool: Uses dflow API (on-chain truth for trading decisions)
 * - UI hooks: Use Supabase (recorded data for display)
 * - USDC balance: Single RPC call (accurate, simple, fast)
 *
 * Recording:
 * - All results written atomically to Supabase:
 *   → agent_decisions
 *   → agent_trades
 *   → agent_positions (upsert)
 *   → agent_sessions (update value)
 */
export async function tradingAgentWorkflow(
  input: TradingInput,
): Promise<TradingResult> {
  console.log(`[tradingAgent:${input.modelId}] Starting trading workflow`);

  try {
    // Step 1: Get session (durable)
    const session = await getSessionStep();

    // Step 2: Get or create agent session (durable)
    const agentSession = await getAgentSessionStep(
      session.id,
      input.modelId,
      input.walletAddress,
    );

    // Step 3: Get USDC balance (single RPC call - needed for trading budget)
    const usdcBalance = await getUsdcBalanceStep(input.walletAddress);

    // Step 4: Run AI agent (durable wrapper, agent inside is NOT durable)
    // Agent's retrievePosition tool uses dflow API (on-chain truth)
    const result = await runAgentStep(input, usdcBalance);

    // Step 5: Record all results atomically
    // (decision + trades + positions + session value)
    await recordResultsStep(agentSession, input, result, usdcBalance);

    console.log(
      `[tradingAgent:${input.modelId}] Completed: ${result.decision}, ${result.trades.length} trades`,
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
  walletAddress: string,
): Promise<AgentSession> {
  "use step";
  const modelName = getModelName(modelId) || modelId;
  return await getOrCreateAgentSession(
    sessionId,
    modelId,
    modelName,
    walletAddress,
  );
}

/**
 * Get USDC balance only (single RPC call).
 * Durable: Safe to retry (read-only operation).
 */
async function getUsdcBalanceStep(walletAddress: string): Promise<number> {
  "use step";
  try {
    const balance = await getCurrencyBalance(walletAddress, "USDC");
    if (!balance) return 0;
    // Convert from bigint raw amount to number (formatted)
    return parseFloat(balance.formatted);
  } catch (error) {
    console.error("[tradingAgent] Failed to fetch USDC balance:", error);
    return 0;
  }
}

/**
 * Run the PredictionMarketAgent.
 *
 * Durable wrapper: If this step fails, it restarts from the beginning.
 * Agent inside is NOT durable: Tools fire once without retry.
 * Agent tools use dflow API for on-chain data (not Supabase).
 *
 * IMPORTANT: placeOrder tool executes once - retrying would create duplicate orders.
 */
async function runAgentStep(
  input: TradingInput,
  usdcBalance: number,
): Promise<TradingResult> {
  "use step";

  // Create agent with wallet context
  const agent = new PredictionMarketAgent({
    modelId: input.modelId,
    walletAddress: input.walletAddress,
    privateKey: getWalletPrivateKey(input.modelId),
    maxSteps: 10,
  });

  // Run the agent with lean context (signal + balance)
  return await agent.run({
    signal: input.signal,
    usdcBalance,
    testMode: input.testMode,
  });
}

/**
 * Record all results to database in one step.
 * Updates: agent_decisions, agent_trades, agent_positions, agent_sessions
 * Durable: Database writes must complete for data integrity.
 * Triggers Supabase Realtime → UI updates.
 */
async function recordResultsStep(
  agentSession: AgentSession,
  input: TradingInput,
  result: TradingResult,
  usdcBalance: number,
): Promise<void> {
  "use step";

  // Determine trigger type
  let triggerType: TriggerType = "periodic";
  if (input.signal) {
    triggerType = input.signal.type;
  }

  // 1. Record the decision
  const decision = await recordAgentDecision({
    agentSessionId: agentSession.id,
    triggerType,
    triggerDetails: input.signal?.data || {},
    marketTicker: result.marketTicker,
    marketTitle: result.marketTitle,
    decision: result.decision,
    reasoning: result.reasoning,
    confidence: result.confidence,
    portfolioValueAfter: result.portfolioValue || usdcBalance,
  });

  console.log(
    `[tradingAgent:${input.modelId}] Recorded decision: ${result.decision} (id: ${decision.id})`,
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
  await updateAgentSessionValue(
    agentSession.id,
    result.portfolioValue || usdcBalance,
    (result.portfolioValue || usdcBalance) - agentSession.startingCapital,
  );
}
