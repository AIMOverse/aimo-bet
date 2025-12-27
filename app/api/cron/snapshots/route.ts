import { NextResponse } from "next/server";
import { getActiveSession, createBulkSnapshots } from "@/lib/supabase/db";
import { MODELS } from "@/lib/ai/models";

// ============================================================================
// Cron Job: Snapshot Performance Data from dflow
// Triggered by Vercel Cron or external scheduler
// ============================================================================

// Solana RPC endpoint
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Token-2022 Program ID
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface TokenAccount {
  mint: string;
  amount: number;
}

interface OutcomeMint {
  mint: string;
  marketTicker: string;
}

interface Market {
  ticker: string;
  milestoneId?: string;
  accounts?: {
    yesMint?: string;
    noMint?: string;
  };
}

interface LiveDataEntry {
  milestoneId: string;
  yesAsk?: number;
  yesBid?: number;
}

export async function GET(req: Request) {
  // Verify cron secret for security
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/snapshots] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    console.log("[cron/snapshots] Starting snapshot job");

    // Get all enabled models with wallets from config
    const enabledModels = MODELS.filter((m) => m.enabled);
    const modelsWithWallets = enabledModels.filter((m) => m.walletAddress);

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
      `[cron/snapshots] Processing ${modelsWithWallets.length} models for session ${session.id}`,
    );

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // Fetch balance + positions for each model
    const snapshots = await Promise.all(
      modelsWithWallets.map(async (model) => {
        try {
          // Get cash balance
          const balanceRes = await fetch(
            `${baseUrl}/api/solana/balance?wallet=${model.walletAddress}`,
          );
          const balanceData = await balanceRes.json();
          const cashBalance = parseFloat(balanceData.formatted) || 0;

          // Get positions using the new 3-step flow
          const positionsValue = await fetchPositionsValue(
            baseUrl,
            model.walletAddress!,
          );

          // Total account value = cash + positions
          const accountValue = cashBalance + positionsValue;

          console.log(
            `[cron/snapshots] Model ${model.name}: cash=${cashBalance}, positions=${positionsValue}, total=${accountValue}`,
          );

          return {
            sessionId: session.id,
            modelId: model.id,
            accountValue,
          };
        } catch (error) {
          console.error(
            `[cron/snapshots] Failed to fetch data for model ${model.id}:`,
            error,
          );
          // Return snapshot with 0 value on error
          return {
            sessionId: session.id,
            modelId: model.id,
            accountValue: 0,
          };
        }
      }),
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
      { status: 500 },
    );
  }
}

// ============================================================================
// Helper: Fetch positions value using the new 3-step flow
// ============================================================================

async function fetchPositionsValue(
  baseUrl: string,
  walletAddress: string,
): Promise<number> {
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
    console.error("[cron/snapshots] RPC error:", rpcResult.error);
    return 0;
  }

  const accounts = rpcResult.result?.value || [];
  const tokenAccounts: TokenAccount[] = [];

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

  if (tokenAccounts.length === 0) return 0;

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
      "[cron/snapshots] filter-outcome-mints error:",
      filterRes.status,
    );
    return 0;
  }

  const filterData = await filterRes.json();
  const outcomeMints: OutcomeMint[] = filterData.outcomeMints || [];

  if (outcomeMints.length === 0) return 0;

  // Step 3: Get market details (includes milestoneIds)
  const batchRes = await fetch(`${baseUrl}/api/dflow/markets/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mints: outcomeMints.map((m) => m.mint) }),
  });

  if (!batchRes.ok) {
    console.error("[cron/snapshots] markets/batch error:", batchRes.status);
    return 0;
  }

  const batchData = await batchRes.json();
  const markets: Market[] = batchData.markets || [];

  // Build market lookup by mint
  const marketByMint = new Map<string, Market>();
  const milestoneIds: string[] = [];

  for (const market of markets) {
    if (market.accounts?.yesMint)
      marketByMint.set(market.accounts.yesMint, market);
    if (market.accounts?.noMint)
      marketByMint.set(market.accounts.noMint, market);
    if (market.milestoneId) milestoneIds.push(market.milestoneId);
  }

  // Step 4: Get live prices for position valuation
  const priceMap = new Map<string, number>();

  if (milestoneIds.length > 0) {
    const liveDataRes = await fetch(
      `${baseUrl}/api/dflow/live-data?milestoneIds=${milestoneIds.join(",")}`,
    );

    if (liveDataRes.ok) {
      const liveData = await liveDataRes.json();
      if (Array.isArray(liveData)) {
        for (const entry of liveData as LiveDataEntry[]) {
          // Use yesAsk as the mark price
          if (entry.milestoneId && entry.yesAsk !== undefined) {
            priceMap.set(entry.milestoneId, entry.yesAsk);
          }
        }
      }
    }
  }

  // Calculate total position value
  const tokenBalanceMap = new Map(tokenAccounts.map((t) => [t.mint, t.amount]));
  let totalValue = 0;

  for (const outcomeMint of outcomeMints) {
    const market = marketByMint.get(outcomeMint.mint);
    const quantity = tokenBalanceMap.get(outcomeMint.mint) || 0;

    if (!market || !market.milestoneId) continue;

    const yesPrice = priceMap.get(market.milestoneId) || 0.5;
    const isYes = market.accounts?.yesMint === outcomeMint.mint;
    const markPrice = isYes ? yesPrice : 1 - yesPrice;

    totalValue += quantity * markPrice;
  }

  return totalValue;
}
