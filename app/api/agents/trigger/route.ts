import { NextRequest, NextResponse } from "next/server";
import {
  getModelsWithWallets,
  getWalletPrivateKey,
  getModelName,
} from "@/lib/ai/models/catalog";
import {
  PredictionMarketAgent,
  type TradingResult,
  type MarketSignal,
} from "@/lib/ai/agents";
import { getGlobalSession } from "@/lib/supabase/db";
import {
  getOrCreateAgentSession,
  recordAgentDecision,
  recordAgentTrade,
  updateAgentSessionValue,
} from "@/lib/supabase/agents";
import type {
  AgentSession,
  TriggerType as DbTriggerType,
} from "@/lib/supabase/types";
import {
  getPortfolioSnapshot,
  type PortfolioSnapshot,
} from "@/lib/solana/portfolio";

// ============================================================================
// Agent Trigger Endpoint
// ============================================================================
// Internal webhook to trigger agents in parallel within a single request.
// Called by: PartyKit relay (market signals), cron jobs, manual triggers.
//
// Authentication: Requires WEBHOOK_SECRET in Authorization header.
// This endpoint should ONLY be called internally - never exposed to public.
// ============================================================================

export type TriggerType = "market" | "cron" | "manual";

interface TriggerRequest {
  /** Specific model to trigger (omit to trigger all enabled models) */
  modelId?: string;
  /** Market signal data (for market-triggered runs) */
  signal?: MarketSignal;
  /** What initiated this trigger */
  triggerType: TriggerType;
  /** When true, uses test prompt that forces a $1-5 trade */
  testMode?: boolean;
}

interface TriggerResult {
  modelId: string;
  status: "completed" | "failed";
  decision?: string;
  trades?: number;
  portfolioValue?: number;
  error?: string;
}

/**
 * POST /api/agents/trigger
 *
 * Trigger trading agents for one or all models.
 * Agents run in parallel within this request (not background workflows).
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret (internal use only)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as TriggerRequest;
    const { modelId, signal, triggerType = "manual", testMode = false } = body;

    console.log(
      `[agents/trigger] Received trigger: type=${triggerType}, modelId=${
        modelId || "all"
      }, signal=${signal?.type || "none"}`
    );

    // Get global trading session
    const session = await getGlobalSession();

    // Get models to trigger
    const allModels = getModelsWithWallets();

    if (allModels.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No models with wallets configured",
        triggered: 0,
        results: [],
      });
    }

    // Filter to specific model if requested
    const modelsToTrigger = modelId
      ? allModels.filter((m) => m.id === modelId)
      : allModels;

    if (modelsToTrigger.length === 0) {
      return NextResponse.json(
        { error: `Model not found: ${modelId}` },
        { status: 404 }
      );
    }

    // Run all agents in parallel within this request
    const results = await Promise.allSettled(
      modelsToTrigger.map(async (model): Promise<TriggerResult> => {
        try {
          const result = await runAgent({
            sessionId: session.id,
            modelId: model.id,
            walletAddress: model.walletAddress!,
            signal,
            triggerType,
            testMode,
          });

          console.log(
            `[agents/trigger] ${model.id}: ${result.decision}, ${
              result.trades.length
            } trades, portfolio: $${result.portfolioValue?.toFixed(2)}`
          );

          return {
            modelId: model.id,
            status: "completed",
            decision: result.decision,
            trades: result.trades.length,
            portfolioValue: result.portfolioValue,
          };
        } catch (error) {
          console.error(`[agents/trigger] Failed for ${model.id}:`, error);

          return {
            modelId: model.id,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    // Summarize results
    const successResults = results
      .filter(
        (r): r is PromiseFulfilledResult<TriggerResult> =>
          r.status === "fulfilled" && r.value.status === "completed"
      )
      .map((r) => r.value);

    const failedResults = results
      .filter(
        (r): r is PromiseFulfilledResult<TriggerResult> =>
          r.status === "fulfilled" && r.value.status === "failed"
      )
      .map((r) => r.value);

    const succeeded = successResults.length;
    const failed = failedResults.length;

    console.log(
      `[agents/trigger] Completed: ${succeeded} succeeded, ${failed} failed`
    );

    return NextResponse.json({
      success: true,
      triggerType,
      signal: signal ? { type: signal.type, ticker: signal.ticker } : undefined,
      completed: succeeded,
      failed,
      results: [...successResults, ...failedResults],
    });
  } catch (error) {
    console.error("[agents/trigger] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Agent Execution (inline, not workflow)
// ============================================================================

interface RunAgentInput {
  sessionId: string;
  modelId: string;
  walletAddress: string;
  signal?: MarketSignal;
  triggerType: TriggerType;
  testMode?: boolean;
}

/**
 * Run a single agent - fetch context, execute AI, record results.
 * Runs inline (not as a background workflow).
 */
async function runAgent(input: RunAgentInput): Promise<TradingResult> {
  const { sessionId, modelId, walletAddress, signal, triggerType, testMode } =
    input;

  // Get or create agent session
  const modelName = getModelName(modelId) || modelId;
  const agentSession = await getOrCreateAgentSession(
    sessionId,
    modelId,
    modelName,
    walletAddress
  );

  // Fetch portfolio snapshot (USDC + positions value)
  const portfolioBefore = await fetchPortfolio(walletAddress);

  // Create and run the AI agent
  const agent = new PredictionMarketAgent({
    modelId,
    walletAddress,
    privateKey: getWalletPrivateKey(modelId),
    maxSteps: 10,
  });

  const result = await agent.run({
    signal,
    usdcBalance: portfolioBefore.usdcBalance,
    testMode,
  });

  // Fetch updated portfolio after trades
  const portfolioAfter = await fetchPortfolio(walletAddress);

  // Record to database
  await recordResults(agentSession, input, result, portfolioAfter);

  return {
    ...result,
    portfolioValue: portfolioAfter.totalValue,
  };
}

/**
 * Fetch portfolio snapshot with error handling.
 */
async function fetchPortfolio(
  walletAddress: string
): Promise<PortfolioSnapshot> {
  try {
    return await getPortfolioSnapshot(walletAddress);
  } catch (error) {
    console.error("[agents/trigger] Failed to fetch portfolio:", error);
    return {
      wallet: walletAddress,
      timestamp: new Date(),
      usdcBalance: 0,
      positionsValue: 0,
      totalValue: 0,
      positions: [],
    };
  }
}

/**
 * Record decision and trades to database.
 */
async function recordResults(
  agentSession: AgentSession,
  input: RunAgentInput,
  result: TradingResult,
  portfolio: PortfolioSnapshot
): Promise<void> {
  // Map trigger type
  let dbTriggerType: DbTriggerType = "periodic";
  if (input.signal) {
    dbTriggerType = input.signal.type as DbTriggerType;
  } else if (input.triggerType === "cron") {
    dbTriggerType = "periodic";
  } else if (input.triggerType === "manual") {
    dbTriggerType = "periodic"; // Manual triggers recorded as periodic
  }

  // Record the decision
  const decision = await recordAgentDecision({
    agentSessionId: agentSession.id,
    triggerType: dbTriggerType,
    triggerDetails: input.signal?.data || {},
    marketTicker: result.marketTicker,
    marketTitle: result.marketTitle,
    decision: result.decision,
    reasoning: result.reasoning,
    confidence: result.confidence,
    portfolioValueAfter: portfolio.totalValue,
  });

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

  // Update agent session value for leaderboard
  await updateAgentSessionValue(
    agentSession.id,
    portfolio.totalValue,
    portfolio.totalValue - agentSession.startingCapital
  );
}

/**
 * GET /api/agents/trigger
 *
 * Health check / info endpoint for the trigger service.
 */
export async function GET(req: NextRequest) {
  // No auth required for health check
  const models = getModelsWithWallets();

  return NextResponse.json({
    status: "ready",
    message: "Agent trigger endpoint is ready to receive signals",
    configuredModels: models.length,
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      wallet: m.walletAddress?.slice(0, 8) + "...",
    })),
  });
}
