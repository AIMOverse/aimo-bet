import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/market
// ============================================================================

// ============================================================================
// GET /api/dflow/markets/[ticker] - Get market details
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker } = await params;

    if (!ticker) {
      return NextResponse.json(
        { error: "Market ticker is required" },
        { status: 400 },
      );
    }

    console.log("[dflow/markets/ticker] Fetching market:", ticker);

    const response = await dflowMetadataFetch(
      `/market/${encodeURIComponent(ticker)}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/markets/ticker] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/markets/ticker] Fetched market details for:", ticker);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/markets/ticker] Failed to fetch market:", error);
    return NextResponse.json(
      { error: "Failed to fetch market details" },
      { status: 500 },
    );
  }
}
