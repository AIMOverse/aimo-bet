import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
import {
  tradingAgentWorkflow,
  type TradingInput,
  type MarketSignal,
} from "@/lib/ai/workflows/tradingAgent";
import { activeWorkflowsMap } from "@/app/api/agents/status/route";

// ============================================================================
// Agent Trigger Endpoint (Workflow-based)
// ============================================================================
// Internal webhook to spawn agent workflows. Returns immediately with run IDs.
// Called by: PartyKit relay (market signals), cron jobs, manual triggers.
//
// Authentication: Requires WEBHOOK_SECRET in Authorization header.
// This endpoint should ONLY be called internally - never exposed to public.
//
// Clients can poll /api/agents/status?runIds=... to check workflow status.
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

interface SpawnedWorkflow {
  modelId: string;
  runId: string;
}

interface TriggerResponse {
  success: boolean;
  triggerType: TriggerType;
  signal?: { type: string; ticker?: string };
  spawned: number;
  failed: number;
  workflows: SpawnedWorkflow[];
  errors: Array<{ modelId: string; error: string }>;
}

/**
 * POST /api/agents/trigger
 *
 * Spawn trading agent workflows for one or all models.
 * Returns immediately with run IDs - workflows execute in background.
 * Poll /api/agents/status to check completion.
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

    // Get models to trigger
    const allModels = getModelsWithWallets();

    if (allModels.length === 0) {
      return NextResponse.json({
        success: true,
        triggerType,
        spawned: 0,
        failed: 0,
        workflows: [],
        errors: [],
      } satisfies TriggerResponse);
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

    // Spawn workflows for all models in parallel
    const results = await Promise.allSettled(
      modelsToTrigger.map(async (model): Promise<SpawnedWorkflow> => {
        const input: TradingInput = {
          modelId: model.id,
          walletAddress: model.walletAddress!,
          signal,
          testMode,
        };

        // Start workflow (returns immediately, executes in background)
        const run = await start(tradingAgentWorkflow, [input]);

        // Track this workflow for status polling
        activeWorkflowsMap.set(run.runId, {
          modelId: model.id,
          startedAt: new Date(),
        });

        console.log(
          `[agents/trigger] Spawned workflow for ${model.id}: ${run.runId}`
        );

        return {
          modelId: model.id,
          runId: run.runId,
        };
      })
    );

    // Collect results
    const workflows: SpawnedWorkflow[] = [];
    const errors: Array<{ modelId: string; error: string }> = [];

    results.forEach((result, index) => {
      const model = modelsToTrigger[index];
      if (result.status === "fulfilled") {
        workflows.push(result.value);
      } else {
        errors.push({
          modelId: model.id,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error",
        });
      }
    });

    console.log(
      `[agents/trigger] Spawned ${workflows.length} workflows, ${errors.length} failed`
    );

    return NextResponse.json({
      success: true,
      triggerType,
      signal: signal ? { type: signal.type, ticker: signal.ticker } : undefined,
      spawned: workflows.length,
      failed: errors.length,
      workflows,
      errors,
    } satisfies TriggerResponse);
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
export async function GET() {
  const models = getModelsWithWallets();

  return NextResponse.json({
    status: "ready",
    message: "Agent trigger endpoint spawns workflows (non-blocking)",
    configuredModels: models.length,
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      wallet: m.walletAddress?.slice(0, 8) + "...",
    })),
    endpoints: {
      trigger: "POST /api/agents/trigger - Spawn workflows, returns run IDs",
      status: "GET /api/agents/status?runIds=... - Poll workflow status",
      cron: "GET /api/agents/cron - Vercel cron job",
    },
  });
}
