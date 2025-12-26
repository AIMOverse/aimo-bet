import { NextResponse } from "next/server";
import { getRun, start } from "workflow/api";
import { priceWatcherWorkflow } from "@/lib/workflows";
import { getGlobalSession } from "@/lib/supabase/db";
import { getModelsWithWallets, getWalletPrivateKey } from "@/lib/ai/models/catalog";
import {
  PredictionMarketAgent,
  type PriceSwing,
} from "@/lib/ai/agents/predictionMarketAgent";
import {
  syncPricesAndDetectSwings,
  type MarketPrice,
} from "@/lib/supabase/prices";
import { TRADING_CONFIG } from "@/lib/config";
import type {
  MarketContext,
  PredictionMarket,
  Trade,
  Broadcast,
} from "@/types/db";

// ============================================================================
// Cron Job: Health Check for Price Watcher Workflow
// Falls back to manual trading loop if workflow isn't running
// Triggered by Vercel Cron every 1 minute (requires Pro plan)
// ============================================================================

const PRICE_WATCHER_RUN_ID = "price-watcher-singleton";

export async function GET(req: Request) {
  // Verify cron secret for security
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/trading] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // First, check if price watcher workflow is running
    let workflowStatus = "unknown";
    let workflowRestarted = false;

    try {
      const run = await getRun(PRICE_WATCHER_RUN_ID);

      if (!run || run.status !== "running") {
        console.log("[cron/trading] Price watcher not running, restarting...");

        await start(priceWatcherWorkflow, [], {
          runId: PRICE_WATCHER_RUN_ID,
        });

        workflowStatus = "restarted";
        workflowRestarted = true;
      } else {
        workflowStatus = "running";
        // Workflow is handling everything, just return health status
        return NextResponse.json({
          message: "Price watcher healthy",
          workflowStatus: "running",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (workflowError) {
      console.error("[cron/trading] Workflow check failed:", workflowError);
      workflowStatus = "error";
      // Fall through to legacy behavior
    }

    // Fallback: Run trading loop directly if workflow isn't handling it
    console.log("[cron/trading] Running fallback trading loop");

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // 1. Fetch current prices from dflow
    const markets = await fetchMarkets(baseUrl);
    if (markets.length === 0) {
      console.log("[cron/trading] No markets available");
      return NextResponse.json({
        message: "No markets available",
        workflowStatus,
        workflowRestarted,
        swings: 0,
        modelsRun: 0,
      });
    }

    // Convert to MarketPrice format for swing detection
    const currentPrices: MarketPrice[] = markets.map((m) => ({
      ticker: m.ticker,
      yes_bid: m.yesPrice,
      yes_ask: m.yesPrice,
      no_bid: m.noPrice,
      no_ask: m.noPrice,
    }));

    // 2. Sync prices and detect swings
    const swings = await syncPricesAndDetectSwings(
      currentPrices,
      TRADING_CONFIG.swingThreshold
    );

    console.log(`[cron/trading] Detected ${swings.length} price swings`);

    // 3. If no significant swings, skip agent runs (save cost)
    if (swings.length === 0) {
      return NextResponse.json({
        message: "No significant price movements",
        workflowStatus,
        workflowRestarted,
        swings: 0,
        modelsRun: 0,
      });
    }

    // 4. Get models with wallets configured
    const enabledModels = getModelsWithWallets();
    if (enabledModels.length === 0) {
      console.log("[cron/trading] No enabled models with wallets");
      return NextResponse.json({
        message: "No models with wallets configured",
        workflowStatus,
        workflowRestarted,
        swings: swings.length,
        modelsRun: 0,
      });
    }

    console.log(`[cron/trading] Processing ${enabledModels.length} models`);

    // 5. Get global session
    const session = await getGlobalSession();
    console.log(`[cron/trading] Using session: ${session.id}`);

    // 6. Run agent for each model
    const results = await Promise.allSettled(
      enabledModels.map(async (model) => {
        try {
          console.log(`[cron/trading] Processing model: ${model.name}`);

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
            session.startingCapital
          );

          // Execute agentic trading loop with swing info
          const result = await agent.executeTradingLoop(context, swings);

          console.log(
            `[cron/trading] Model ${model.name} completed. Trades: ${result.trades.length}`
          );

          return {
            modelId: model.id,
            reasoning: result.reasoning,
            trades: result.trades.length,
            steps: result.steps.length,
          };
        } catch (error) {
          console.error(`[cron/trading] Error for model ${model.id}:`, error);
          throw error;
        }
      })
    );

    // Count successes and failures
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    console.log(
      `[cron/trading] Completed: ${successes} successes, ${failures} failures`
    );

    return NextResponse.json({
      success: true,
      workflowStatus,
      workflowRestarted,
      swings: swings.length,
      modelsRun: enabledModels.length,
      successes,
      failures,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/trading] Trading cron failed:", error);
    return NextResponse.json(
      { error: "Failed to run trading cron" },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

// Solana RPC endpoint
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Token-2022 Program ID
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Market type for batch response
interface MarketData {
  ticker: string;
  title: string;
  accounts?: {
    yesMint?: string;
    noMint?: string;
  };
}

/**
 * Fetch positions using the 3-step flow:
 * 1. RPC query for token accounts
 * 2. Filter to outcome mints
 * 3. Get market details
 */
async function fetchPositions(
  baseUrl: string,
  walletAddress: string
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
    }
  );

  if (!filterRes.ok) {
    console.error(
      "[cron/trading] filter-outcome-mints error:",
      filterRes.status
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

    // Determine YES or NO based on mint
    const side: "yes" | "no" =
      market?.accounts?.noMint === outcomeMint.mint ? "no" : "yes";

    positions.push({
      id: outcomeMint.mint,
      portfolioId: "",
      marketTicker: market?.ticker || outcomeMint.marketTicker,
      marketTitle: market?.title || outcomeMint.marketTicker,
      side,
      quantity,
      avgEntryPrice: 0, // Not available from on-chain data
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
  startingCapital: number
): Promise<MarketContext> {
  // Fetch balance
  let cashBalance = startingCapital;
  try {
    const balanceRes = await fetch(
      `${baseUrl}/api/solana/balance?wallet=${walletAddress}`
    );
    const balanceData = await balanceRes.json();
    cashBalance = parseFloat(balanceData.formatted) || startingCapital;
  } catch (error) {
    console.error("[cron/trading] Failed to fetch balance:", error);
  }

  // Fetch positions using the new 3-step flow
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
      `${baseUrl}/api/dflow/trades?wallet=${walletAddress}&limit=10`
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
          })
        )
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
