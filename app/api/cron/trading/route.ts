import { NextResponse } from "next/server";
import { getHookByToken, start } from "workflow/api";
import { signalListenerWorkflow } from "@/lib/ai/workflows";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";

// ============================================================================
// Cron Job: Health Check for Signal Listener Workflows
// Ensures all agent workflows are running, restarts any that have stopped
// Triggered by Vercel Cron every 1 minute
// ============================================================================

function getHookToken(modelId: string): string {
  return `signals:${modelId}`;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/trading] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const models = getModelsWithWallets();

    if (models.length === 0) {
      return NextResponse.json({
        message: "No models with wallets configured",
        healthy: 0,
        restarted: 0,
      });
    }

    let healthyCount = 0;
    let restartedCount = 0;
    const errors: string[] = [];

    for (const model of models) {
      const hookToken = getHookToken(model.id);

      try {
        const hook = await getHookByToken(hookToken);

        if (hook) {
          healthyCount++;
          console.log(`[cron/trading] ${model.id}: healthy`);
        } else {
          console.log(`[cron/trading] ${model.id}: restarting workflow...`);

          await start(signalListenerWorkflow, [
            {
              modelId: model.id,
              walletAddress: model.walletAddress!,
            },
          ]);

          restartedCount++;
          console.log(`[cron/trading] ${model.id}: workflow started`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[cron/trading] ${model.id}: error - ${message}`);
        errors.push(`${model.id}: ${message}`);
      }
    }

    return NextResponse.json({
      message:
        restartedCount > 0
          ? `Restarted ${restartedCount} workflow(s)`
          : "All signal listeners healthy",
      healthy: healthyCount,
      restarted: restartedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/trading] Trading cron failed:", error);
    return NextResponse.json(
      { error: "Failed to run trading cron" },
      { status: 500 },
    );
  }
}
