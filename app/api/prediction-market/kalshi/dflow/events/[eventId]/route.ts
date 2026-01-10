import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Event
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/events/event
// ============================================================================

// ============================================================================
// GET /api/dflow/events/[eventId] - Get event details
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
    const withNestedMarkets = searchParams.get("withNestedMarkets");

    // Build query params
    const queryParams = new URLSearchParams();
    if (withNestedMarkets) {
      queryParams.set("withNestedMarkets", withNestedMarkets);
    }

    const queryString = queryParams.toString();
    const path = `/event/${encodeURIComponent(eventId)}${queryString ? `?${queryString}` : ""}`;

    console.log("[dflow/events/eventId] Fetching event:", eventId);

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/events/eventId] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/events/eventId] Fetched event details for:", eventId);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/events/eventId] Failed to fetch event:", error);
    return NextResponse.json(
      { error: "Failed to fetch event details" },
      { status: 500 },
    );
  }
}
