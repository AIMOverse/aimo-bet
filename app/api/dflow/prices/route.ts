import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Live Data
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data
// ============================================================================

// ============================================================================
// GET /api/dflow/prices - Get current market prices
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tickers = searchParams.get("tickers");

    console.log(
      "[dflow/prices] Fetching prices for tickers:",
      tickers || "all",
    );

    const response = await dflowMetadataFetch("/live-data");

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/prices] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    let data = await response.json();

    // Filter by tickers if provided
    if (tickers) {
      const tickerList = tickers.split(",").map((t) => t.trim());
      if (Array.isArray(data)) {
        data = data.filter((item: { market_ticker?: string }) =>
          tickerList.includes(item.market_ticker || ""),
        );
      }
    }

    console.log(
      "[dflow/prices] Returning",
      Array.isArray(data) ? data.length : 1,
      "price entries",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/prices] Failed to fetch prices:", error);
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 },
    );
  }
}
