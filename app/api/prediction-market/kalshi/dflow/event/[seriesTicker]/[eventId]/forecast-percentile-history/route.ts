import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Event Forecast Percentile History
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/events/forecast-percentile-history
// ============================================================================

// ============================================================================
// GET /api/dflow/events/[seriesTicker]/[eventId]/forecast-percentile-history
// Get historical forecast percentile data for an event
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ seriesTicker: string; eventId: string }> },
) {
  try {
    const { seriesTicker, eventId } = await params;

    if (!seriesTicker || !eventId) {
      return NextResponse.json(
        { error: "Series ticker and event ID are required" },
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

    const path = `/event/${encodeURIComponent(seriesTicker)}/${encodeURIComponent(eventId)}/forecast_percentile_history?${queryParams}`;

    console.log(
      "[dflow/events/forecast-percentile-history] Fetching for:",
      seriesTicker,
      eventId,
    );

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/events/forecast-percentile-history] API error:",
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
      "[dflow/events/forecast-percentile-history] Fetched history for:",
      seriesTicker,
      eventId,
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/events/forecast-percentile-history] Failed to fetch:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch forecast percentile history" },
      { status: 500 },
    );
  }
}
