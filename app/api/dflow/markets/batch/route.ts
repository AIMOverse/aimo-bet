import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/markets-batch
// ============================================================================

// ============================================================================
// POST /api/dflow/markets/batch - Get multiple markets by tickers/mints
// Returns up to 100 markets maximum
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tickers, mints } = body;

    if (!tickers && !mints) {
      return NextResponse.json(
        { error: "At least one of tickers or mints is required" },
        { status: 400 },
      );
    }

    if (tickers && !Array.isArray(tickers)) {
      return NextResponse.json(
        { error: "tickers must be an array" },
        { status: 400 },
      );
    }

    if (mints && !Array.isArray(mints)) {
      return NextResponse.json(
        { error: "mints must be an array" },
        { status: 400 },
      );
    }

    console.log(
      "[dflow/markets/batch] Fetching batch:",
      tickers?.length || 0,
      "tickers,",
      mints?.length || 0,
      "mints",
    );

    const response = await dflowMetadataFetch("/markets/batch", {
      method: "POST",
      body: JSON.stringify({ tickers, mints }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/markets/batch] API error:",
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
      "[dflow/markets/batch] Fetched",
      data?.markets?.length || 0,
      "markets",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/markets/batch] Failed to fetch markets:", error);
    return NextResponse.json(
      { error: "Failed to fetch markets batch" },
      { status: 500 },
    );
  }
}
