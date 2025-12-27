import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
import { tradingAgentWorkflow } from "@/lib/ai/workflows/tradingAgent";

interface Signal {
  type: "price_swing" | "volume_spike" | "orderbook_imbalance";
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
}

interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

/**
 * Convert a market signal to the PriceSwing format expected by tradingAgentWorkflow.
 * All signal types are normalized to price swing format for the agent to process.
 */
function signalToPriceSwing(signal: Signal): PriceSwing {
  switch (signal.type) {
    case "price_swing":
      return {
        ticker: signal.ticker,
        previousPrice: signal.data.previousPrice as number,
        currentPrice: signal.data.currentPrice as number,
        changePercent: signal.data.changePercent as number,
      };

    case "volume_spike":
      // Volume spike indicates market activity - create a synthetic price swing
      // The agent will use tools to get current prices
      return {
        ticker: signal.ticker,
        previousPrice: 0,
        currentPrice: 0,
        changePercent: 0,
      };

    case "orderbook_imbalance":
      // Orderbook imbalance indicates potential price movement
      // The agent will analyze the current state
      return {
        ticker: signal.ticker,
        previousPrice: 0,
        currentPrice: 0,
        changePercent: 0,
      };

    default:
      return {
        ticker: signal.ticker,
        previousPrice: 0,
        currentPrice: 0,
        changePercent: 0,
      };
  }
}

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const signal = (await req.json()) as Signal;

    console.log(
      `[signals/trigger] Received signal: ${signal.type} for ${signal.ticker}`
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

    // Convert signal to price swing format
    const priceSwing = signalToPriceSwing(signal);

    // Start trading workflow for each model (parallel)
    const workflowPromises = models.map((model) =>
      start(tradingAgentWorkflow, [
        {
          modelId: model.id,
          walletAddress: model.walletAddress!,
          priceSwings: [priceSwing],
          signal, // Pass full signal for richer context
        },
      ])
    );

    // Wait for all workflows to start (not complete)
    await Promise.all(workflowPromises);

    console.log(
      `[signals/trigger] Started ${models.length} trading workflows for ${signal.ticker}`
    );

    return NextResponse.json({
      success: true,
      signal: signal.type,
      ticker: signal.ticker,
      modelsTriggered: models.length,
    });
  } catch (error) {
    console.error("[signals/trigger] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
