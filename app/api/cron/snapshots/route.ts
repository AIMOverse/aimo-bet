import { NextResponse } from "next/server";
import {
  getArenaModels,
  getActiveSession,
  createBulkSnapshots,
} from "@/lib/supabase/arena";

// ============================================================================
// Cron Job: Snapshot Performance Data from dflow
// Triggered by Vercel Cron or external scheduler
// ============================================================================

export async function GET(req: Request) {
  // Verify cron secret for security
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/snapshots] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    console.log("[cron/snapshots] Starting snapshot job");

    // Get all enabled models with wallets
    const models = await getArenaModels(true);
    const modelsWithWallets = models.filter((m) => m.walletAddress);

    if (modelsWithWallets.length === 0) {
      console.log("[cron/snapshots] No models with wallets configured");
      return NextResponse.json({
        message: "No models with wallets configured",
        count: 0,
      });
    }

    // Get active session
    const session = await getActiveSession();
    if (!session || session.status !== "running") {
      console.log("[cron/snapshots] No active running session");
      return NextResponse.json({ message: "No active session" });
    }

    console.log(
      `[cron/snapshots] Processing ${modelsWithWallets.length} models for session ${session.id}`
    );

    // Fetch live prices for position valuation
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const pricesRes = await fetch(`${baseUrl}/api/dflow/prices`);
    const pricesData = await pricesRes.json();
    const priceMap = new Map<string, number>();

    if (Array.isArray(pricesData)) {
      pricesData.forEach((p: { market_ticker: string; yes_ask: string }) => {
        // Use yes_ask as the mark price for positions
        priceMap.set(p.market_ticker, parseFloat(p.yes_ask) || 0);
      });
    }

    // Fetch balance + positions for each model from dflow
    const snapshots = await Promise.all(
      modelsWithWallets.map(async (model) => {
        try {
          // Get cash balance
          const balanceRes = await fetch(
            `${baseUrl}/api/dflow/balance?wallet=${model.walletAddress}`
          );
          const balanceData = await balanceRes.json();
          const cashBalance = parseFloat(balanceData.formatted) || 0;

          // Get positions
          const positionsRes = await fetch(
            `${baseUrl}/api/dflow/positions?wallet=${model.walletAddress}`
          );
          const positionsData = await positionsRes.json();

          // Calculate position values
          let positionsValue = 0;
          if (
            positionsData.positions &&
            Array.isArray(positionsData.positions)
          ) {
            positionsValue = positionsData.positions.reduce(
              (
                sum: number,
                pos: { market_ticker: string; quantity: number; outcome: string }
              ) => {
                const price = priceMap.get(pos.market_ticker) || 0;
                // For "yes" positions, use yes price; for "no", use (1 - yes price)
                const markPrice =
                  pos.outcome === "yes" ? price : 1 - price;
                return sum + pos.quantity * markPrice;
              },
              0
            );
          }

          // Total account value = cash + positions
          const accountValue = cashBalance + positionsValue;

          console.log(
            `[cron/snapshots] Model ${model.name}: cash=${cashBalance}, positions=${positionsValue}, total=${accountValue}`
          );

          return {
            sessionId: session.id,
            modelId: model.id,
            accountValue,
          };
        } catch (error) {
          console.error(
            `[cron/snapshots] Failed to fetch data for model ${model.id}:`,
            error
          );
          // Return snapshot with 0 value on error
          return {
            sessionId: session.id,
            modelId: model.id,
            accountValue: 0,
          };
        }
      })
    );

    // Filter out zero-value snapshots (errors)
    const validSnapshots = snapshots.filter((s) => s.accountValue > 0);

    if (validSnapshots.length > 0) {
      // Save all snapshots
      await createBulkSnapshots(validSnapshots);
      console.log(`[cron/snapshots] Saved ${validSnapshots.length} snapshots`);
    } else {
      console.log("[cron/snapshots] No valid snapshots to save");
    }

    return NextResponse.json({
      success: true,
      count: validSnapshots.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/snapshots] Snapshot cron failed:", error);
    return NextResponse.json(
      { error: "Failed to create snapshots" },
      { status: 500 }
    );
  }
}
