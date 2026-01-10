import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Event Candlesticks
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/events/event-candlesticks
// ============================================================================

// ============================================================================
// GET /api/dflow/events/[eventId]/candlesticks - Get event candlesticks
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    if (!eventId) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);

    // Required query parameters
    const startTs = searchParams.get("startTs");
    const endTs = searchParams.get("endTs");
    const periodInterval = searchParams.get("periodInterval");

    if (!startTs || !endTs || !periodInterval) {
      return NextResponse.json(
        {
          error:
            "Missing required parameters: startTs, endTs, and periodInterval are required",
        },
        { status: 400 },
      );
    }

    // Validate periodInterval (must be 1, 60, or 1440)
    const validIntervals = ["1", "60", "1440"];
    if (!validIntervals.includes(periodInterval)) {
      return NextResponse.json(
        {
          error: "periodInterval must be 1, 60, or 1440 (minutes)",
        },
        { status: 400 },
      );
    }

    const queryParams = new URLSearchParams();
    queryParams.set("startTs", startTs);
    queryParams.set("endTs", endTs);
    queryParams.set("periodInterval", periodInterval);

    const path = `/event/${encodeURIComponent(eventId)}/candlesticks?${queryParams}`;

    console.log(
      "[dflow/events/eventId/candlesticks] Fetching candlesticks for:",
      eventId,
    );

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/events/eventId/candlesticks] API error:",
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
      "[dflow/events/eventId/candlesticks] Fetched candlesticks for:",
      eventId,
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/events/eventId/candlesticks] Failed to fetch candlesticks:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch candlesticks" },
      { status: 500 },
    );
  }
}
