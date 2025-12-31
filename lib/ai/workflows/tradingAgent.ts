"use workflow";

import { sleep } from "workflow";
import {
  PredictionMarketAgent,
  type TradingResult,
  type ExecutedTrade,
  type MarketSignal,
} from "@/lib/ai/agents";
import { getWalletPrivateKey, getModelName } from "@/lib/ai/models/catalog";
import { getGlobalSession } from "@/lib/supabase/db";
import {
  getOrCreateAgentSession,
  recordAgentDecision,
  recordAgentTrade,
  updateAgentSessionValue,
} from "@/lib/supabase/agents";
import type { AgentSession, TriggerType } from "@/lib/supabase/types";

// ============================================================================
// Types
// ============================================================================

export interface TradingInput {
  modelId: string;
  walletAddress: string;
  signal?: MarketSignal;
}

// Re-export TradingResult for consumers
export type { TradingResult, MarketSignal };

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

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

    // Step 3: Fetch USDC balance (durable - safe to retry, read-only)
    const usdcBalance = await fetchBalanceStep(input.walletAddress);

    // Step 4: Run AI agent (durable wrapper, agent inside is NOT durable)
    const result = await runAgentStep(input, usdcBalance);

    // Step 5: Wait for order fills (durable - long-running polling)
    if (result.trades.length > 0) {
      await waitForFillsStep(result.trades);
    }

    // Step 6: Record to database (durable - must complete)
    await recordResultsStep(agentSession, input, result);

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
 * Fetch USDC balance for the agent.
 * Durable: Safe to retry (read-only operation).
 */
async function fetchBalanceStep(walletAddress: string): Promise<number> {
  "use step";

  try {
    const res = await fetch(
      `${BASE_URL}/api/solana/balance?wallet=${walletAddress}`,
    );
    if (res.ok) {
      const data = await res.json();
      return parseFloat(data.formatted) || 0;
    }
  } catch (error) {
    console.error("[tradingAgent] Failed to fetch balance:", error);
  }
  return 0;
}

/**
 * Run the PredictionMarketAgent.
 *
 * Durable wrapper: If this step fails, it restarts from the beginning.
 * Agent inside is NOT durable: Tools fire once without retry.
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
  });
}

/**
 * Wait for order fills with exponential backoff.
 * Durable: Long-running polling that may take minutes.
 */
async function waitForFillsStep(trades: ExecutedTrade[]): Promise<void> {
  "use step";

  for (const trade of trades) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = await fetch(`${BASE_URL}/api/dflow/order/${trade.id}`);
        if (res.ok) {
          const status = await res.json();
          if (status.status === "filled" || status.status === "cancelled") {
            console.log(
              `[tradingAgent] Order ${trade.id} status: ${status.status}`,
            );
            break;
          }
        }
      } catch (error) {
        console.error(`[tradingAgent] Error checking order status:`, error);
      }

      // Exponential backoff: 5s, 10s, 20s, 40s, 60s (capped)
      const delay = Math.min(5 * Math.pow(2, attempt), 60);
      await sleep(`${delay}s`);
    }
  }
}

/**
 * Record decision and trades to database.
 * Durable: Database writes must complete for data integrity.
 * Triggers Supabase Realtime → chat feed updates.
 */
async function recordResultsStep(
  agentSession: AgentSession,
  input: TradingInput,
  result: TradingResult,
): Promise<void> {
  "use step";

  // Determine trigger type
  let triggerType: TriggerType = "periodic";
  if (input.signal) {
    triggerType = input.signal.type;
  }

  // Record the decision
  const decision = await recordAgentDecision({
    agentSessionId: agentSession.id,
    triggerType,
    triggerDetails: input.signal?.data || {},
    marketTicker: result.marketTicker,
    marketTitle: result.marketTitle,
    decision: result.decision,
    reasoning: result.reasoning,
    confidence: result.confidence,
    portfolioValueAfter: result.portfolioValue,
  });

  console.log(
    `[tradingAgent:${input.modelId}] Recorded decision: ${result.decision} (id: ${decision.id})`,
  );

  // Record each trade
  for (const trade of result.trades) {
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
  }

  // Update agent session's current value for leaderboard
  await updateAgentSessionValue(
    agentSession.id,
    result.portfolioValue,
    result.portfolioValue - agentSession.startingCapital,
  );
}
