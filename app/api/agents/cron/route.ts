import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
import {
  tradingAgentWorkflow,
  type TradingInput,
} from "@/lib/ai/workflows/tradingAgent";
import { activeWorkflowsMap } from "@/app/api/agents/status/route";

// ============================================================================
// Cron Job Endpoint for Agent Workflows
// ============================================================================
// GET /api/agents/cron - Trigger new agent workflows (every 15-30 min)
//
// Authentication: Requires CRON_SECRET in Authorization header.
//
// Configure in vercel.json:
// {
//   "crons": [
//     { "path": "/api/agents/cron", "schedule": "*/30 * * * *" }
//   ]
// }
// ============================================================================

interface SpawnedWorkflow {
  modelId: string;
  runId: string;
}

/**
 * GET /api/agents/cron
 *
 * Vercel cron job endpoint - triggers all agents periodically.
 * Spawns workflows directly (no fetch to /api/agents/trigger).
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this for cron jobs)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.log("[agents/cron] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[agents/cron] Cron job triggered, spawning workflows");

  try {
    // Get models to trigger
    const allModels = getModelsWithWallets();

    if (allModels.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No models with wallets configured",
        spawned: 0,
        failed: 0,
        workflows: [],
      });
    }

    // Spawn workflows for all models in parallel
    const results = await Promise.allSettled(
      allModels.map(async (model): Promise<SpawnedWorkflow> => {
        const input: TradingInput = {
          modelId: model.id,
          walletAddress: model.walletAddress!,
          // No signal for cron triggers
        };

        // Start workflow (returns immediately, executes in background)
        const run = await start(tradingAgentWorkflow, [input]);

        // Track this workflow for status polling
        activeWorkflowsMap.set(run.runId, {
          modelId: model.id,
          startedAt: new Date(),
        });

        console.log(
          `[agents/cron] Spawned workflow for ${model.id}: ${run.runId}`
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
      const model = allModels[index];
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
        console.error(
          `[agents/cron] Failed to spawn workflow for ${model.id}:`,
          result.reason
        );
      }
    });

    console.log(
      `[agents/cron] Spawned ${workflows.length} workflows, ${errors.length} failed`
    );

    return NextResponse.json({
      success: true,
      message: "Workflows spawned",
      spawned: workflows.length,
      failed: errors.length,
      workflows,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[agents/cron] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
