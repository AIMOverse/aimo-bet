import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Orderbook API - By Ticker
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/orderbook/orderbook-by-ticker
// ============================================================================

// ============================================================================
// GET /api/dflow/orderbook/[ticker] - Get orderbook by market ticker
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

    console.log("[dflow/orderbook/ticker] Fetching orderbook:", ticker);

    const response = await dflowMetadataFetch(
      `/orderbook/${encodeURIComponent(ticker)}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/orderbook/ticker] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/orderbook/ticker] Fetched orderbook for:", ticker);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/orderbook/ticker] Failed to fetch orderbook:", error);
    return NextResponse.json(
      { error: "Failed to fetch orderbook" },
      { status: 500 },
    );
  }
}
