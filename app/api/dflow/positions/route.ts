import { NextResponse } from "next/server";

// ============================================================================
// dflow Positions - On-chain + Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/outcome-mints
// ============================================================================

const DFLOW_METADATA_API = "https://prediction-markets-api.dflow.net/api/v1";

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
        { status: 400 }
      );
    }

    // Get outcome mints for the markets
    const params = new URLSearchParams();
    if (tickers) params.set("tickers", tickers);
    if (!includeClosed) params.set("status", "active");

    const response = await fetch(
      `${DFLOW_METADATA_API}/outcome-mints?${params}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/positions] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status }
      );
    }

    const outcomeMints = await response.json();

    // In a full implementation, we would query on-chain token balances
    // for the wallet address against these outcome mints
    // For now, return the outcome mints with placeholder balance info
    const positions = Array.isArray(outcomeMints)
      ? outcomeMints.map((mint: {
          market_ticker?: string;
          outcome?: string;
          mint?: string;
        }) => ({
          market_ticker: mint.market_ticker,
          outcome: mint.outcome,
          mint: mint.mint,
          quantity: 0, // Would be fetched from on-chain
          wallet: walletAddress,
        }))
      : [];

    console.log("[dflow/positions] Returning", positions.length, "position entries");

    return NextResponse.json({
      wallet: walletAddress,
      positions,
    });
  } catch (error) {
    console.error("[dflow/positions] Failed to fetch positions:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
