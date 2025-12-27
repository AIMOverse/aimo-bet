import { NextRequest, NextResponse } from "next/server";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
// import { tradingAgentWorkflow } from "@/lib/ai/workflows/tradingAgent";

interface Signal {
  type: "price_swing" | "volume_spike" | "orderbook_imbalance";
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
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

    // Trigger trading workflow for each model
    // TODO: Uncomment when workflow is ready
    // await Promise.all(
    //   models.map((model) =>
    //     tradingAgentWorkflow({
    //       modelId: model.id,
    //       walletAddress: model.walletAddress!,
    //       signal,
    //     })
    //   )
    // );

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
