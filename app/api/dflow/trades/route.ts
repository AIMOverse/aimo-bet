import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Trades
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/trades/trades
// ============================================================================

// ============================================================================
// GET /api/dflow/trades - Get trade history
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");
    const limit = searchParams.get("limit") || "50";
    const walletAddress = searchParams.get("wallet");

    console.log("[dflow/trades] Fetching trades:", {
      ticker,
      limit,
      walletAddress,
    });

    // Build query params for dflow API
    const params = new URLSearchParams();
    params.set("limit", limit);
    if (ticker) params.set("market_ticker", ticker);
    if (walletAddress) params.set("wallet", walletAddress);

    const response = await dflowMetadataFetch(`/trades?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/trades] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log(
      "[dflow/trades] Fetched",
      Array.isArray(data) ? data.length : 0,
      "trades",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/trades] Failed to fetch trades:", error);
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500 },
    );
  }
}
