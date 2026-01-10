import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Live Data by Event
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data-by-event
// ============================================================================

// ============================================================================
// GET /api/dflow/live-data/by-event/[eventTicker] - Get live data by event ticker
// Query params:
//   - minimumStartDate: Minimum start date to filter milestones (RFC3339 format)
//   - category: Filter by milestone category
//   - competition: Filter by competition
//   - sourceId: Filter by source ID
//   - type: Filter by milestone type
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventTicker: string }> },
) {
  try {
    const { eventTicker } = await params;

    if (!eventTicker) {
      return NextResponse.json(
        { error: "Event ticker is required" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const minimumStartDate = searchParams.get("minimumStartDate");
    const category = searchParams.get("category");
    const competition = searchParams.get("competition");
    const sourceId = searchParams.get("sourceId");
    const type = searchParams.get("type");

    console.log("[dflow/live-data/by-event] Fetching live data for event:", eventTicker, {
      minimumStartDate,
      category,
      competition,
      sourceId,
      type,
    });

    // Build query params for dflow API
    const queryParams = new URLSearchParams();
    if (minimumStartDate) queryParams.set("minimumStartDate", minimumStartDate);
    if (category) queryParams.set("category", category);
    if (competition) queryParams.set("competition", competition);
    if (sourceId) queryParams.set("sourceId", sourceId);
    if (type) queryParams.set("type", type);

    const queryString = queryParams.toString();
    const path = `/live_data/by-event/${encodeURIComponent(eventTicker)}${queryString ? `?${queryString}` : ""}`;

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/live-data/by-event] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/live-data/by-event] Fetched live data for event:", eventTicker);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/live-data/by-event] Failed to fetch live data:", error);
    return NextResponse.json(
      { error: "Failed to fetch live data" },
      { status: 500 },
    );
  }
}
