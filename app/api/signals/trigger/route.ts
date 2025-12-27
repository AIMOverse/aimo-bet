import { NextRequest, NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
import type { MarketSignal } from "@/lib/ai/workflows";

/**
 * Signal Trigger Endpoint
 *
 * Called by PartyKit relay when significant market signals are detected.
 * Uses resumeHook to send signals to long-running signalListenerWorkflow instances.
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const signal = (await req.json()) as MarketSignal;

    console.log(
      `[signals/trigger] Received signal: ${signal.type} for ${signal.ticker}`,
    );

    // Get all models with wallets
    const models = getModelsWithWallets();

    if (models.length === 0) {
      console.log("[signals/trigger] No models with wallets configured");
      return NextResponse.json({
        success: true,
        signal: signal.type,
        ticker: signal.ticker,
        modelsTriggered: 0,
        message: "No models with wallets configured",
      });
    }

    // Resume each model's signal listener hook
    // The hook token format is: signals:${modelId}
    const results = await Promise.allSettled(
      models.map(async (model) => {
        const token = `signals:${model.id}`;
        try {
          await resumeHook(token, signal);
          console.log(`[signals/trigger] Resumed hook for model ${model.id}`);
          return { modelId: model.id, success: true };
        } catch (error) {
          // Hook might not exist yet if workflow hasn't started
          console.warn(
            `[signals/trigger] Failed to resume hook for ${model.id}:`,
            error,
          );
          return { modelId: model.id, success: false, error };
        }
      }),
    );

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;
    const failed = results.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && !r.value.success),
    ).length;

    console.log(
      `[signals/trigger] Triggered ${succeeded}/${models.length} models for ${signal.ticker}`,
    );

    return NextResponse.json({
      success: true,
      signal: signal.type,
      ticker: signal.ticker,
      modelsTriggered: succeeded,
      modelsFailed: failed,
    });
  } catch (error) {
    console.error("[signals/trigger] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
