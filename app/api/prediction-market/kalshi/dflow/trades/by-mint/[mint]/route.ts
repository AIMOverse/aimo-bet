import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Trades by Mint
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/trades/trades-by-mint
// ============================================================================

// ============================================================================
// GET /api/dflow/trades/by-mint/[mint] - Get trades by mint address
// Query params:
//   - limit: Max trades to return (1-1000, default 100)
//   - cursor: Pagination cursor (trade ID) for starting point
//   - minTs: Filter trades after Unix timestamp
//   - maxTs: Filter trades before Unix timestamp
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  try {
    const { mint } = await params;

    if (!mint) {
      return NextResponse.json(
        { error: "Mint address is required" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit");
    const cursor = searchParams.get("cursor");
    const minTs = searchParams.get("minTs");
    const maxTs = searchParams.get("maxTs");

    console.log("[dflow/trades/by-mint] Fetching trades for mint:", mint, {
      limit,
      cursor,
      minTs,
      maxTs,
    });

    // Build query params for dflow API
    const queryParams = new URLSearchParams();
    if (limit) queryParams.set("limit", limit);
    if (cursor) queryParams.set("cursor", cursor);
    if (minTs) queryParams.set("minTs", minTs);
    if (maxTs) queryParams.set("maxTs", maxTs);

    const queryString = queryParams.toString();
    const path = `/trades/by-mint/${encodeURIComponent(mint)}${queryString ? `?${queryString}` : ""}`;

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/trades/by-mint] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log(
      "[dflow/trades/by-mint] Fetched",
      data.trades?.length ?? 0,
      "trades for mint:",
      mint,
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/trades/by-mint] Failed to fetch trades:", error);
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500 },
    );
  }
}
