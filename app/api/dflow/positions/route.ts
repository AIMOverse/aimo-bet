import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Positions - On-chain + Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/outcome-mints
// ============================================================================

// Solana RPC endpoint
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// ============================================================================
// Types
// ============================================================================

interface OutcomeMint {
  market_ticker: string;
  outcome: "yes" | "no";
  mint: string;
}

interface Position {
  market_ticker: string;
  outcome: "yes" | "no";
  mint: string;
  quantity: number;
  wallet: string;
}

// ============================================================================
// Helper: Get token balance for a specific mint
// ============================================================================

async function getTokenBalanceForMint(
  owner: string,
  mint: string,
): Promise<number> {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [owner, { mint }, { encoding: "jsonParsed" }],
      }),
    });

    const result = await response.json();

    if (result.error) {
      console.error("[dflow/positions] RPC error:", result.error);
      return 0;
    }

    // Sum up balances from all token accounts for this mint
    const accounts = result.result?.value || [];
    if (accounts.length === 0) {
      return 0;
    }

    let totalBalance = 0;
    for (const account of accounts) {
      const parsed = account.account?.data?.parsed?.info;
      if (parsed) {
        const amount = parseInt(parsed.tokenAmount?.amount || "0", 10);
        const decimals = parsed.tokenAmount?.decimals || 0;
        // Convert to human-readable units
        totalBalance += amount / Math.pow(10, decimals);
      }
    }

    return totalBalance;
  } catch (error) {
    console.error("[dflow/positions] Failed to query token balance:", error);
    return 0;
  }
}

// ============================================================================
// GET /api/dflow/positions - Get wallet positions (outcome token holdings)
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tickers = searchParams.get("tickers");
    const includeClosed = searchParams.get("include_closed") === "true";
    const walletAddress = searchParams.get("wallet");

    console.log("[dflow/positions] Fetching positions:", {
      tickers,
      includeClosed,
      walletAddress,
    });

    if (!walletAddress) {
      return NextResponse.json(
        { error: "wallet address is required" },
        { status: 400 },
      );
    }

    // Get outcome mints from dflow API
    const params = new URLSearchParams();
    if (tickers) params.set("tickers", tickers);
    if (!includeClosed) params.set("status", "active");

    const response = await dflowMetadataFetch(`/outcome-mints?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/positions] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const outcomeMints: OutcomeMint[] = await response.json();

    if (!Array.isArray(outcomeMints) || outcomeMints.length === 0) {
      return NextResponse.json({
        wallet: walletAddress,
        positions: [],
      });
    }

    // Query on-chain balances for each outcome mint
    // Batch requests to avoid rate limiting
    const batchSize = 10;
    const positions: Position[] = [];

    for (let i = 0; i < outcomeMints.length; i += batchSize) {
      const batch = outcomeMints.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (mint) => {
          const quantity = await getTokenBalanceForMint(
            walletAddress,
            mint.mint,
          );
          return {
            market_ticker: mint.market_ticker,
            outcome: mint.outcome,
            mint: mint.mint,
            quantity,
            wallet: walletAddress,
          };
        }),
      );

      // Only include positions with non-zero quantity
      positions.push(...batchResults.filter((p) => p.quantity > 0));
    }

    console.log(
      "[dflow/positions] Found",
      positions.length,
      "positions with balance",
    );

    return NextResponse.json({
      wallet: walletAddress,
      positions,
    });
  } catch (error) {
    console.error("[dflow/positions] Failed to fetch positions:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 },
    );
  }
}
