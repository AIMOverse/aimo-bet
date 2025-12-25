import { NextResponse } from "next/server";
import { getGlobalSession } from "@/lib/supabase/db";
import { MODELS } from "@/lib/ai/models/catalog";
import {
  createPredictionMarketAgent,
  type PredictionMarketAgent,
} from "@/lib/ai/agents/predictionMarketAgent";
import type {
  MarketContext,
  PredictionMarket,
  Trade,
  Broadcast,
} from "@/types/db";

// ============================================================================
// Cron Job: Run Trading Loop for Each Model
// Triggered by Vercel Cron every 15 minutes
// ============================================================================

export async function GET(req: Request) {
  // Verify cron secret for security
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/trading] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    console.log("[cron/trading] Starting trading cron job");

    // Get the global session
    const session = await getGlobalSession();
    console.log(`[cron/trading] Using session: ${session.id}`);

    // Get all enabled models with wallet addresses
    const enabledModels = MODELS.filter((m) => m.enabled && m.walletAddress);

    if (enabledModels.length === 0) {
      console.log("[cron/trading] No enabled models with wallets");
      return NextResponse.json({
        message: "No enabled models with wallets",
        count: 0,
      });
    }

    console.log(`[cron/trading] Processing ${enabledModels.length} models`);

    // Fetch available markets
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const markets = await fetchMarkets(baseUrl);

    if (markets.length === 0) {
      console.log("[cron/trading] No markets available");
      return NextResponse.json({
        message: "No markets available",
        count: 0,
      });
    }

    // Run trading loop for each model
    const results = await Promise.allSettled(
      enabledModels.map(async (model) => {
        try {
          console.log(`[cron/trading] Processing model: ${model.name}`);

          // Create agent for this model
          const agent = createPredictionMarketAgent({
            modelId: model.id,
            modelIdentifier: model.id,
            walletAddress: model.walletAddress!,
            sessionId: session.id,
          });

          // Build market context
          const context = await buildMarketContext(
            baseUrl,
            model.walletAddress!,
            markets,
            session.startingCapital,
          );

          // Execute trading loop
          const result = await agent.executeTradingLoop(context);

          console.log(
            `[cron/trading] Model ${model.name} decision: ${result.decision.action}`,
          );

          return {
            modelId: model.id,
            decision: result.decision,
            broadcast: result.broadcast,
          };
        } catch (error) {
          console.error(`[cron/trading] Error for model ${model.id}:`, error);
          throw error;
        }
      }),
    );

    // Count successes and failures
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    console.log(
      `[cron/trading] Completed: ${successes} successes, ${failures} failures`,
    );

    return NextResponse.json({
      success: true,
      modelsProcessed: successes,
      failures,
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

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchMarkets(baseUrl: string): Promise<PredictionMarket[]> {
  try {
    const res = await fetch(`${baseUrl}/api/dflow/markets`);
    const data = await res.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((m: Record<string, unknown>) => ({
      ticker: m.ticker as string,
      title: m.title as string,
      category: (m.category as string) || "Other",
      yesPrice: parseFloat(m.yes_price as string) || 0.5,
      noPrice: parseFloat(m.no_price as string) || 0.5,
      volume: parseFloat(m.volume as string) || 0,
      expirationDate: new Date(m.expiration_date as string),
      status: (m.status as "open" | "closed" | "settled") || "open",
    }));
  } catch (error) {
    console.error("[cron/trading] Failed to fetch markets:", error);
    return [];
  }
}

async function buildMarketContext(
  baseUrl: string,
  walletAddress: string,
  availableMarkets: PredictionMarket[],
  startingCapital: number,
): Promise<MarketContext> {
  // Fetch balance
  let cashBalance = startingCapital;
  try {
    const balanceRes = await fetch(
      `${baseUrl}/api/dflow/balance?wallet=${walletAddress}`,
    );
    const balanceData = await balanceRes.json();
    cashBalance = parseFloat(balanceData.formatted) || startingCapital;
  } catch (error) {
    console.error("[cron/trading] Failed to fetch balance:", error);
  }

  // Fetch positions
  const positions: MarketContext["portfolio"]["positions"] = [];
  try {
    const positionsRes = await fetch(
      `${baseUrl}/api/dflow/positions?wallet=${walletAddress}`,
    );
    const positionsData = await positionsRes.json();
    if (positionsData.positions && Array.isArray(positionsData.positions)) {
      positions.push(
        ...positionsData.positions.map(
          (p: {
            id: string;
            market_ticker: string;
            market_title: string;
            outcome: string;
            quantity: number;
            avg_price: number;
          }) => ({
            id: p.id,
            portfolioId: "",
            marketTicker: p.market_ticker,
            marketTitle: p.market_title,
            side: p.outcome as "yes" | "no",
            quantity: p.quantity,
            avgEntryPrice: p.avg_price,
            status: "open" as const,
            openedAt: new Date(),
          }),
        ),
      );
    }
  } catch (error) {
    console.error("[cron/trading] Failed to fetch positions:", error);
  }

  // Fetch recent trades
  const recentTrades: Trade[] = [];
  try {
    const tradesRes = await fetch(
      `${baseUrl}/api/dflow/trades?wallet=${walletAddress}&limit=10`,
    );
    const tradesData = await tradesRes.json();
    if (tradesData.trades && Array.isArray(tradesData.trades)) {
      recentTrades.push(
        ...tradesData.trades.map(
          (t: {
            id: string;
            market_ticker: string;
            market_title: string;
            side: string;
            quantity: number;
            price: number;
            created_at: string;
          }) => ({
            id: t.id,
            portfolioId: "",
            marketTicker: t.market_ticker,
            marketTitle: t.market_title,
            side: t.side as "yes" | "no",
            action: "buy" as const,
            quantity: t.quantity,
            price: t.price,
            notional: t.quantity * t.price,
            createdAt: new Date(t.created_at),
          }),
        ),
      );
    }
  } catch (error) {
    console.error("[cron/trading] Failed to fetch trades:", error);
  }

  // Calculate total portfolio value
  const positionsValue = positions.reduce((sum, pos) => {
    const market = availableMarkets.find((m) => m.ticker === pos.marketTicker);
    if (!market) return sum;
    const price = pos.side === "yes" ? market.yesPrice : market.noPrice;
    return sum + pos.quantity * price;
  }, 0);

  return {
    availableMarkets,
    portfolio: {
      id: "",
      sessionId: "",
      modelId: "",
      cashBalance,
      createdAt: new Date(),
      positions,
      totalValue: cashBalance + positionsValue,
      unrealizedPnl: 0,
    },
    recentTrades,
    recentBroadcasts: [] as Broadcast[],
  };
}
