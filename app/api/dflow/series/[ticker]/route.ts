import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Series by Ticker
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/series/series-by-ticker
// ============================================================================

// ============================================================================
// GET /api/dflow/series/[ticker] - Get series by ticker
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker } = await params;

    if (!ticker) {
      return NextResponse.json(
        { error: "Series ticker is required" },
        { status: 400 },
      );
    }

    console.log("[dflow/series/ticker] Fetching series:", ticker);

    const response = await dflowMetadataFetch(
      `/series/${encodeURIComponent(ticker)}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/series/ticker] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/series/ticker] Fetched series:", ticker);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/series/ticker] Failed to fetch series:", error);
    return NextResponse.json(
      { error: "Failed to fetch series" },
      { status: 500 },
    );
  }
}
