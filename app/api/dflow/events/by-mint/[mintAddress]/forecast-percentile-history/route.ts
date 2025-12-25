import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Event Forecast Percentile History by Mint
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/events/forecast-percentile-history-by-mint
// ============================================================================

// ============================================================================
// GET /api/dflow/events/by-mint/[mintAddress]/forecast-percentile-history
// Get historical forecast percentile data for an event by mint address
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mintAddress: string }> },
) {
  try {
    const { mintAddress } = await params;

    if (!mintAddress) {
      return NextResponse.json(
        { error: "Mint address is required" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);

    // Required query parameters
    const percentiles = searchParams.get("percentiles");
    const startTs = searchParams.get("startTs");
    const endTs = searchParams.get("endTs");
    const periodInterval = searchParams.get("periodInterval");

    if (!percentiles || !startTs || !endTs || !periodInterval) {
      return NextResponse.json(
        {
          error:
            "Missing required parameters: percentiles, startTs, endTs, and periodInterval are required",
        },
        { status: 400 },
      );
    }

    // Validate periodInterval (must be 0, 1, 60, or 1440)
    const validIntervals = ["0", "1", "60", "1440"];
    if (!validIntervals.includes(periodInterval)) {
      return NextResponse.json(
        {
          error: "periodInterval must be 0, 1, 60, or 1440 (minutes)",
        },
        { status: 400 },
      );
    }

    const queryParams = new URLSearchParams();
    queryParams.set("percentiles", percentiles);
    queryParams.set("startTs", startTs);
    queryParams.set("endTs", endTs);
    queryParams.set("periodInterval", periodInterval);

    const path = `/event/by-mint/${encodeURIComponent(mintAddress)}/forecast_percentile_history?${queryParams}`;

    console.log(
      "[dflow/events/by-mint/forecast-percentile-history] Fetching for mint:",
      mintAddress,
    );

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/events/by-mint/forecast-percentile-history] API error:",
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
      "[dflow/events/by-mint/forecast-percentile-history] Fetched history for mint:",
      mintAddress,
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/events/by-mint/forecast-percentile-history] Failed to fetch:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch forecast percentile history" },
      { status: 500 },
    );
  }
}
