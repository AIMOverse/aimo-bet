import { NextResponse } from "next/server";

// ============================================================================
// dflow Prediction Markets Metadata API - Live Data
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data
// ============================================================================

const DFLOW_METADATA_API = "https://prediction-markets-api.dflow.net/api/v1";

// ============================================================================
// GET /api/dflow/prices - Get current market prices
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tickers = searchParams.get("tickers");

    console.log("[dflow/prices] Fetching prices for tickers:", tickers || "all");

    // If specific tickers requested, use live-data-by-mint or filter results
    let endpoint = `${DFLOW_METADATA_API}/live-data`;

    const response = await fetch(endpoint, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/prices] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status }
      );
    }

    let data = await response.json();

    // Filter by tickers if provided
    if (tickers) {
      const tickerList = tickers.split(",").map((t) => t.trim());
      if (Array.isArray(data)) {
        data = data.filter((item: { market_ticker?: string }) =>
          tickerList.includes(item.market_ticker || "")
        );
      }
    }

    console.log("[dflow/prices] Returning", Array.isArray(data) ? data.length : 1, "price entries");

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/prices] Failed to fetch prices:", error);
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
