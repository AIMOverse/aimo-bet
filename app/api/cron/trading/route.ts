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
