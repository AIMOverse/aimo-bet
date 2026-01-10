import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/market-candlesticks-by-mint
// ============================================================================

// ============================================================================
// GET /api/dflow/markets/by-mint/[mint]/candlesticks - Get candlesticks by mint
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  try {
    const { mint } = await params;
    const { searchParams } = new URL(req.url);

    if (!mint) {
      return NextResponse.json(
        { error: "Mint address is required" },
        { status: 400 },
      );
    }

    const startTs = searchParams.get("startTs");
    const endTs = searchParams.get("endTs");
    const periodInterval = searchParams.get("periodInterval");

    if (!startTs || !endTs || !periodInterval) {
      return NextResponse.json(
        { error: "startTs, endTs, and periodInterval are required" },
        { status: 400 },
      );
    }

    // Validate periodInterval (1, 60, or 1440 minutes)
    const validIntervals = ["1", "60", "1440"];
    if (!validIntervals.includes(periodInterval)) {
      return NextResponse.json(
        { error: "periodInterval must be 1, 60, or 1440" },
        { status: 400 },
      );
    }

    const queryParams = new URLSearchParams();
    queryParams.set("startTs", startTs);
    queryParams.set("endTs", endTs);
    queryParams.set("periodInterval", periodInterval);

    console.log(
      "[dflow/markets/by-mint/candlesticks] Fetching candlesticks for mint:",
      mint,
    );

    const response = await dflowMetadataFetch(
      `/market/by-mint/${encodeURIComponent(mint)}/candlesticks?${queryParams}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/markets/by-mint/candlesticks] API error:",
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
      "[dflow/markets/by-mint/candlesticks] Fetched candlesticks for mint:",
      mint,
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/markets/by-mint/candlesticks] Failed to fetch candlesticks:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch candlesticks" },
      { status: 500 },
    );
  }
}
