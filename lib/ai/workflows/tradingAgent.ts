"use workflow";

import { PredictionMarketAgent, type TradingResult } from "@/lib/ai/agents";
import {
  getWalletPrivateKey,
  getModelName,
  getModelsWithWallets,
} from "@/lib/ai/models/catalog";
import { getGlobalSession } from "@/lib/supabase/db";
import {
  getOrCreateAgentSession,
  recordAgentDecision,
  recordAgentTrade,
  upsertAgentPosition,
  updateAgentSessionValue,
  updateAllAgentBalances,
  incrementAgentTokens,
} from "@/lib/supabase/agents";
import { getCurrencyBalance } from "@/lib/crypto/solana/client";
import { getUsdcBalance } from "@/lib/crypto/polygon/client";
import { createAgentSigners } from "@/lib/crypto/signers";
import { checkAndTriggerRebalance } from "@/lib/prediction-market/rebalancing";
import type { AgentSession, TradingSession } from "@/lib/supabase/types";

// ============================================================================
// Types
// ============================================================================

/**
 * Research payload from Parallel webhook
 * Present when triggered by research_complete
 */
export interface ResearchPayload {
  run_id: string;
  status: "completed" | "failed";
  content?: string;
  basis?: Array<{
    field: string;
    citations: Array<{ url: string; excerpt: string }>;
    confidence: number;
    reasoning: string;
  }>;
  error?: string;
}

export interface TradingInput {
  modelId: string;
  walletAddress: string;
  /** Research payload (present when triggered by research completion) */
  research?: ResearchPayload;
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

    // Step 5: Notify relays of new positions
    // This ensures the relay subscribes to markets the agent just traded
    if (result.trades.length > 0) {
      await notifyRelaysStep(result.trades);
    }

    // Step 6: Update balances for ALL agents (durable)
    // This ensures leaderboard reflects current on-chain state
    await updateAllBalancesStep(session);

    // Step 7: Check and trigger cross-chain rebalancing (non-blocking)
    await checkAndRebalanceStep(input.modelId);

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
    maxSteps: 100,
    researchContext: input.research,
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

  // 4. Update token usage if available
  if (result.tokenUsage?.totalTokens) {
    await incrementAgentTokens(agentSession.id, result.tokenUsage.totalTokens);
    console.log(
      `[tradingAgent] Recorded ${result.tokenUsage.totalTokens} tokens for ${agentSession.modelName}`
    );
  }
}

/**
 * Update balances for all agents in the trading session.
 * Fetches USDC balances from the blockchain and updates the database.
 * Uses wallet addresses from env vars (via catalog) for accuracy.
 * This keeps the leaderboard in sync with on-chain state.
 * Durable: Balance updates should complete for data integrity.
 */
async function updateAllBalancesStep(session: TradingSession): Promise<void> {
  "use step";

  console.log(`[tradingAgent] Updating balances for all agents`);

  // Get models with wallet addresses from env vars
  const models = getModelsWithWallets()
    .filter((m) => m.walletAddress)
    .map((m) => ({
      modelId: m.id,
      walletAddress: m.walletAddress!,
    }));

  // Fetch USDC balance from Solana for each agent
  const fetchBalance = async (
    walletAddress: string
  ): Promise<number | null> => {
    const result = await getCurrencyBalance(walletAddress, "USDC");
    if (result === null) return null;
    return Number(result.formatted);
  };

  const updated = await updateAllAgentBalances(
    session.id,
    models,
    fetchBalance
  );
  console.log(`[tradingAgent] Updated ${updated.length} agent balances`);
}

/**
 * Infer platform from ticker format.
 * Polymarket tickers are very long numeric strings (50+ digits).
 * dflow tickers are human-readable with dashes.
 */
function inferPlatform(ticker: string): "polymarket" | "dflow" {
  if (/^\d{50,}$/.test(ticker)) {
    return "polymarket";
  }
  return "dflow";
}

/**
 * Notify the appropriate relay of new market subscriptions.
 * Routes to polymarket-relay or dflow-relay based on platform inferred from ticker.
 * Durable: Relay notifications should complete to ensure market tracking.
 */
async function notifyRelaysStep(
  trades: TradingResult["trades"]
): Promise<void> {
  "use step";

  const partyKitHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!partyKitHost || !webhookSecret) {
    console.warn(
      "[tradingAgent] Missing NEXT_PUBLIC_PARTYKIT_HOST or WEBHOOK_SECRET, skipping relay notification"
    );
    return;
  }

  // Group trades by platform (inferred from ticker format)
  const polymarketMarkets = [
    ...new Set(
      trades
        .filter((t) => inferPlatform(t.marketTicker) === "polymarket")
        .map((t) => t.marketTicker)
    ),
  ];

  const dflowMarkets = [
    ...new Set(
      trades
        .filter((t) => inferPlatform(t.marketTicker) === "dflow")
        .map((t) => t.marketTicker)
    ),
  ];

  // Notify polymarket-relay
  if (polymarketMarkets.length > 0) {
    try {
      const response = await fetch(
        `${partyKitHost}/parties/polymarket-relay/main`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({
            type: "subscribe_markets",
            markets: polymarketMarkets,
          }),
        }
      );

      if (response.ok) {
        const result = (await response.json()) as { subscribed: number };
        if (result.subscribed > 0) {
          console.log(
            `[tradingAgent] Notified polymarket-relay of ${result.subscribed} new markets`
          );
        }
      }
    } catch (error) {
      console.error("[tradingAgent] Error notifying polymarket-relay:", error);
    }
  }

  // Notify dflow-relay
  if (dflowMarkets.length > 0) {
    try {
      const response = await fetch(
        `${partyKitHost}/parties/dflow-relay/main`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({
            type: "subscribe_markets",
            markets: dflowMarkets,
          }),
        }
      );

      if (response.ok) {
        const result = (await response.json()) as { subscribed: number };
        if (result.subscribed > 0) {
          console.log(
            `[tradingAgent] Notified dflow-relay of ${result.subscribed} new markets`
          );
        }
      }
    } catch (error) {
      console.error("[tradingAgent] Error notifying dflow-relay:", error);
    }
  }
}

/**
 * Check balances and trigger cross-chain rebalance if needed.
 * Non-blocking - fires async bridge and returns immediately.
 * Durable: Rebalance check should complete even if subsequent bridge fails.
 */
async function checkAndRebalanceStep(modelId: string): Promise<void> {
  "use step";

  const logPrefix = `[tradingAgent:${modelId}]`;

  try {
    // 1. Get signers for this model
    const signers = await createAgentSigners(modelId);

    if (!signers.svm || !signers.evm) {
      console.log(`${logPrefix} Skipping rebalance - missing signers`);
      return;
    }

    // 2. Fetch current balances
    const [solanaResult, polygonResult] = await Promise.all([
      getCurrencyBalance(signers.svm.address, "USDC"),
      getUsdcBalance(signers.evm.address),
    ]);

    const balances = {
      solana: solanaResult ? Number(solanaResult.formatted) : 0,
      polygon: polygonResult?.balance ?? 0,
    };

    console.log(
      `${logPrefix} Balances: Solana=$${balances.solana}, Polygon=$${balances.polygon}`
    );

    // 3. Check and trigger rebalance (non-blocking)
    const result = await checkAndTriggerRebalance(modelId, signers, balances);

    if (result.triggered) {
      console.log(`${logPrefix} Rebalance triggered: ${result.reason}`);
    }
  } catch (error) {
    // Don't fail the workflow if rebalance check fails
    console.error(`${logPrefix} Rebalance check error:`, error);
  }
}
