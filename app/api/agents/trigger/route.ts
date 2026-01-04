import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { tradingAgentWorkflow } from "@/lib/ai/workflows/tradingAgent";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
import type { MarketSignal, TradingInput } from "@/lib/ai/workflows";

// ============================================================================
// Agent Trigger Endpoint
// ============================================================================
// Internal webhook to trigger agent trading workflows.
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
}

interface TriggerResult {
  modelId: string;
  status: "started" | "failed";
  runId?: string;
  error?: string;
}

/**
 * POST /api/agents/trigger
 *
 * Trigger trading workflow for one or all agents.
 * Agents are stateless - each trigger starts a fresh workflow run.
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
    const { modelId, signal, triggerType = "manual" } = body;

    console.log(
      `[agents/trigger] Received trigger: type=${triggerType}, modelId=${
        modelId || "all"
      }, signal=${signal?.type || "none"}`
    );

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

    // Trigger workflows for each model
    const results = await Promise.allSettled(
      modelsToTrigger.map(async (model): Promise<TriggerResult> => {
        try {
          const input: TradingInput = {
            modelId: model.id,
            walletAddress: model.walletAddress!,
            signal,
          };

          const run = await start(tradingAgentWorkflow, [input]);

          console.log(
            `[agents/trigger] Started workflow for ${model.id}: ${run.runId}`
          );

          return {
            modelId: model.id,
            status: "started",
            runId: run.runId,
          };
        } catch (error) {
          console.error(
            `[agents/trigger] Failed to start workflow for ${model.id}:`,
            error
          );

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
          r.status === "fulfilled" && r.value.status === "started"
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
      `[agents/trigger] Completed: ${succeeded} started, ${failed} failed`
    );

    return NextResponse.json({
      success: true,
      triggerType,
      signal: signal ? { type: signal.type, ticker: signal.ticker } : undefined,
      triggered: succeeded,
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
