import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Trades
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/trades/trades
// ============================================================================

// ============================================================================
// GET /api/dflow/trades - Get trade history
// Query params:
//   - ticker: Filter by market ticker
//   - limit: Max trades to return (1-1000, default 100)
//   - cursor: Pagination cursor (trade ID) for starting point
//   - minTs: Filter trades after Unix timestamp
//   - maxTs: Filter trades before Unix timestamp
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");
    const limit = searchParams.get("limit");
    const cursor = searchParams.get("cursor");
    const minTs = searchParams.get("minTs");
    const maxTs = searchParams.get("maxTs");

    console.log("[dflow/trades] Fetching trades:", {
      ticker,
      limit,
      cursor,
      minTs,
      maxTs,
    });

    // Build query params for dflow API
    const params = new URLSearchParams();
    if (limit) params.set("limit", limit);
    if (ticker) params.set("ticker", ticker);
    if (cursor) params.set("cursor", cursor);
    if (minTs) params.set("minTs", minTs);
    if (maxTs) params.set("maxTs", maxTs);

    const queryString = params.toString();
    const path = queryString ? `/trades?${queryString}` : "/trades";

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/trades] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/trades] Fetched", data.trades?.length ?? 0, "trades");

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/trades] Failed to fetch trades:", error);
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500 },
    );
  }
}
