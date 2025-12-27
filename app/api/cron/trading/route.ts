import { NextResponse } from "next/server";
import { getHookByToken, start, resumeHook } from "workflow/api";
import { signalListenerWorkflow } from "@/lib/ai/workflows";
import { getGlobalSession } from "@/lib/supabase/db";
import {
  getModelsWithWallets,
  getWalletPrivateKey,
} from "@/lib/ai/models/catalog";
import {
  PredictionMarketAgent,
  type PriceSwing,
} from "@/lib/ai/agents/predictionMarketAgent";
import { TRADING_CONFIG } from "@/lib/config";
import type { PredictionMarket, Trade, Broadcast } from "@/lib/supabase/types";
import type { MarketContext } from "@/lib/ai/agents/types";

// ============================================================================
// Cron Job: Health Check for Signal Listener Workflows
// Falls back to manual trading loop if workflows aren't running
// Triggered by Vercel Cron every 1 minute
// ============================================================================

/**
 * Get the hook token for a model's signal listener
 */
function getHookToken(modelId: string): string {
  return `signals:${modelId}`;
}

export async function GET(req: Request) {
  // Verify cron secret for security
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
        fallbackRun: false,
      });
    }

    // ========================================================================
    // Step 1: Health check - ensure all signal listeners are running
    // ========================================================================

    let healthyCount = 0;
    let restartedCount = 0;
    const unhealthyModels: typeof models = [];

    for (const model of models) {
      const hookToken = getHookToken(model.id);

      try {
        // Check if hook exists - if it does, workflow is running and waiting
        const hook = await getHookByToken(hookToken);

        if (hook) {
          healthyCount++;
          console.log(`[cron/trading] ${model.id}: healthy (hook exists)`);
        } else {
          // Workflow not running (no hook), restart it
          console.log(
            `[cron/trading] ${model.id}: not running (no hook), restarting...`,
          );

          await start(signalListenerWorkflow, [
            {
              modelId: model.id,
              walletAddress: model.walletAddress!,
            },
          ]);

          restartedCount++;
          // Mark as unhealthy for fallback since it just restarted
          unhealthyModels.push(model);
        }
      } catch (error) {
        console.error(
          `[cron/trading] Error checking/restarting ${model.id}:`,
          error,
        );
        unhealthyModels.push(model);
      }
    }

    // If all workflows are healthy, just return status
    if (unhealthyModels.length === 0) {
      return NextResponse.json({
        message: "All signal listeners healthy",
        healthy: healthyCount,
        restarted: restartedCount,
        fallbackRun: false,
        timestamp: new Date().toISOString(),
      });
    }

    // ========================================================================
    // Step 2: Fallback - detect price swings and trigger agents directly
    // Only for models that had unhealthy workflows
    // ========================================================================

    console.log(
      `[cron/trading] Running fallback for ${unhealthyModels.length} unhealthy models`,
    );

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // Fetch current prices from dflow
    const markets = await fetchMarkets(baseUrl);
    if (markets.length === 0) {
      return NextResponse.json({
        message: "No markets available for fallback",
        healthy: healthyCount,
        restarted: restartedCount,
        fallbackRun: true,
        swings: 0,
        modelsRun: 0,
      });
    }

    // For fallback, we trigger agents with a periodic signal
    // Price swing detection is now handled by PartyKit
    // Here we just pick the first market as a trigger
    const swings: PriceSwing[] = markets.length > 0 ? [{
      ticker: markets[0].ticker,
      previousPrice: markets[0].yesPrice,
      currentPrice: markets[0].yesPrice,
      changePercent: 0,
    }] : [];

    console.log(`[cron/trading] Fallback: triggering agents with periodic signal`);

    // Get global session
    const session = await getGlobalSession();

    // Run agent for each unhealthy model
    const results = await Promise.allSettled(
      unhealthyModels.map(async (model) => {
        try {
          console.log(
            `[cron/trading] Fallback processing model: ${model.name}`,
          );

          // First, try to send signal via hook (in case workflow just restarted)
          const hookToken = `signals:${model.id}`;
          try {
            const signal = {
              type: "periodic" as const,
              ticker: swings[0]?.ticker || "",
              data: {
                previousPrice: swings[0]?.previousPrice || 0,
                currentPrice: swings[0]?.currentPrice || 0,
                changePercent: swings[0]?.changePercent || 0,
              },
              timestamp: Date.now(),
            };
            await resumeHook(hookToken, signal);
            console.log(`[cron/trading] Sent periodic signal via hook for ${model.id}`);
            return { modelId: model.id, method: "hook" };
          } catch {
            // Hook not ready, fall back to direct agent execution
            console.log(
              `[cron/trading] Hook not ready for ${model.id}, running agent directly`,
            );
          }

          // Create agent with wallet context
          const agent = new PredictionMarketAgent({
            modelId: model.id,
            modelIdentifier: model.id,
            walletAddress: model.walletAddress!,
            walletPrivateKey: getWalletPrivateKey(model.id),
            sessionId: session.id,
          });

          // Build market context
          const context = await buildMarketContext(
            baseUrl,
            model.walletAddress!,
            markets,
            session.startingCapital,
          );

          // Execute agentic trading loop with swing info
          const result = await agent.executeTradingLoop(context, swings);

          console.log(
            `[cron/trading] Model ${model.name} completed. Trades: ${result.trades.length}`,
          );

          return {
            modelId: model.id,
            method: "direct",
            trades: result.trades.length,
            steps: result.steps.length,
          };
        } catch (error) {
          console.error(`[cron/trading] Error for model ${model.id}:`, error);
          throw error;
        }
      }),
    );

    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({
      success: true,
      healthy: healthyCount,
      restarted: restartedCount,
      fallbackRun: true,
      swings: swings.length,
      modelsRun: unhealthyModels.length,
      successes,
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

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface MarketData {
  ticker: string;
  title: string;
  accounts?: {
    yesMint?: string;
    noMint?: string;
  };
}

async function fetchPositions(
  baseUrl: string,
  walletAddress: string,
): Promise<MarketContext["portfolio"]["positions"]> {
  // Step 1: Get all token accounts from wallet
  const rpcResponse = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        walletAddress,
        { programId: TOKEN_2022_PROGRAM_ID },
        { encoding: "jsonParsed" },
      ],
    }),
  });

  const rpcResult = await rpcResponse.json();
  if (rpcResult.error) {
    console.error("[cron/trading] RPC error:", rpcResult.error);
    return [];
  }

  const accounts = rpcResult.result?.value || [];
  const tokenAccounts: { mint: string; amount: number }[] = [];

  for (const account of accounts) {
    const parsed = account.account?.data?.parsed?.info;
    if (parsed) {
      const amount = parseInt(parsed.tokenAmount?.amount || "0", 10);
      const decimals = parsed.tokenAmount?.decimals || 0;
      const quantity = amount / Math.pow(10, decimals);
      if (quantity > 0) {
        tokenAccounts.push({ mint: parsed.mint, amount: quantity });
      }
    }
  }

  if (tokenAccounts.length === 0) return [];

  // Step 2: Filter to prediction market outcome mints
  const filterRes = await fetch(
    `${baseUrl}/api/dflow/markets/filter-outcome-mints`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: tokenAccounts.map((t) => t.mint) }),
    },
  );

  if (!filterRes.ok) {
    console.error(
      "[cron/trading] filter-outcome-mints error:",
      filterRes.status,
    );
    return [];
  }

  const filterData = await filterRes.json();
  const outcomeMints = filterData.outcomeMints || [];

  if (outcomeMints.length === 0) return [];

  // Step 3: Get market details
  const batchRes = await fetch(`${baseUrl}/api/dflow/markets/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mints: outcomeMints.map((m: { mint: string }) => m.mint),
    }),
  });

  if (!batchRes.ok) {
    console.error("[cron/trading] markets/batch error:", batchRes.status);
    return [];
  }

  const batchData = await batchRes.json();
  const markets = batchData.markets || [];

  // Build market lookup by mint
  const marketByMint = new Map<string, MarketData>();
  for (const market of markets as MarketData[]) {
    if (market.accounts?.yesMint)
      marketByMint.set(market.accounts.yesMint, market);
    if (market.accounts?.noMint)
      marketByMint.set(market.accounts.noMint, market);
  }

  // Build positions
  const tokenBalanceMap = new Map(tokenAccounts.map((t) => [t.mint, t.amount]));
  const positions: MarketContext["portfolio"]["positions"] = [];

  for (const outcomeMint of outcomeMints) {
    const market = marketByMint.get(outcomeMint.mint);
    const quantity = tokenBalanceMap.get(outcomeMint.mint) || 0;

    const side: "yes" | "no" =
      market?.accounts?.noMint === outcomeMint.mint ? "no" : "yes";

    positions.push({
      id: outcomeMint.mint,
      portfolioId: "",
      marketTicker: market?.ticker || outcomeMint.marketTicker,
      marketTitle: market?.title || outcomeMint.marketTicker,
      side,
      quantity,
      avgEntryPrice: 0,
      status: "open" as const,
      openedAt: new Date(),
    });
  }

  return positions;
}

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
      `${baseUrl}/api/solana/balance?wallet=${walletAddress}`,
    );
    const balanceData = await balanceRes.json();
    cashBalance = parseFloat(balanceData.formatted) || startingCapital;
  } catch (error) {
    console.error("[cron/trading] Failed to fetch balance:", error);
  }

  // Fetch positions
  const positions: MarketContext["portfolio"]["positions"] = [];
  try {
    const positionsData = await fetchPositions(baseUrl, walletAddress);
    positions.push(...positionsData);
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
