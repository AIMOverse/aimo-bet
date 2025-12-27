import { NextResponse } from "next/server";
import { start, getHookByToken } from "workflow/api";
import { signalListenerWorkflow } from "@/lib/ai/workflows";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";

/**
 * Workflow Management Endpoint
 *
 * POST: Start signal listener workflows for all models
 * GET: Check status of all signal listener workflows
 *
 * Note: We use hook tokens (signals:${modelId}) to check if a workflow is running.
 * The workflow package doesn't support custom run IDs, but hooks are deterministic
 * and allow us to route signals correctly.
 */

/**
 * Get the hook token for a model's signal listener
 */
function getHookToken(modelId: string): string {
  return `signals:${modelId}`;
}

export async function POST(req: Request) {
  // Verify admin secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const models = getModelsWithWallets();

    if (models.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No models with wallets configured",
        started: 0,
        skipped: 0,
      });
    }

    const results = await Promise.allSettled(
      models.map(async (model) => {
        const hookToken = getHookToken(model.id);

        // Check if hook exists (means workflow is running and waiting)
        try {
          const existingHook = await getHookByToken(hookToken);

          if (existingHook) {
            console.log(
              `[workflows/start] Signal listener for ${model.id} already running (hook exists)`,
            );
            return {
              modelId: model.id,
              status: "already_running",
              hookToken,
            };
          }
        } catch {
          // Hook doesn't exist, workflow not running
        }

        // Start the workflow
        const run = await start(signalListenerWorkflow, [
          {
            modelId: model.id,
            walletAddress: model.walletAddress!,
          },
        ]);

        console.log(
          `[workflows/start] Started signal listener for ${model.id}: ${run.runId}`,
        );

        return {
          modelId: model.id,
          status: "started",
          runId: run.runId,
          hookToken,
        };
      }),
    );

    const started = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "started",
    ).length;
    const alreadyRunning = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "already_running",
    ).length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({
      success: true,
      started,
      alreadyRunning,
      failed,
      total: models.length,
      models: results
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<unknown>).value),
    });
  } catch (error) {
    console.error("[workflows/start] Failed to start workflows:", error);
    return NextResponse.json(
      {
        error: "Failed to start workflows",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  // Verify admin secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const models = getModelsWithWallets();

    const statuses = await Promise.allSettled(
      models.map(async (model) => {
        const hookToken = getHookToken(model.id);

        try {
          // Check if hook exists - if it does, workflow is running and waiting
          const hook = await getHookByToken(hookToken);

          if (hook) {
            return { modelId: model.id, hookToken, status: "running" };
          }

          return { modelId: model.id, hookToken, status: "not_running" };
        } catch {
          return { modelId: model.id, hookToken, status: "not_running" };
        }
      }),
    );

    const running = statuses.filter(
      (r) => r.status === "fulfilled" && r.value.status === "running",
    ).length;
    const notRunning = statuses.filter(
      (r) => r.status === "fulfilled" && r.value.status === "not_running",
    ).length;

    return NextResponse.json({
      total: models.length,
      running,
      notRunning,
      models: statuses
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<unknown>).value),
    });
  } catch (error) {
    console.error("[workflows/start] Failed to get status:", error);
    return NextResponse.json(
      {
        error: "Failed to get workflow status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
