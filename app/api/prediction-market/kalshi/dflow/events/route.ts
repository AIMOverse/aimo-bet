import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Events
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/events/events
// ============================================================================

// ============================================================================
// GET /api/dflow/events - Get list of events
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Build query params for dflow API
    const params = new URLSearchParams();

    const limit = searchParams.get("limit");
    if (limit) params.set("limit", limit);

    const cursor = searchParams.get("cursor");
    if (cursor) params.set("cursor", cursor);

    const withNestedMarkets = searchParams.get("withNestedMarkets");
    if (withNestedMarkets) params.set("withNestedMarkets", withNestedMarkets);

    const seriesTickers = searchParams.get("seriesTickers");
    if (seriesTickers) params.set("seriesTickers", seriesTickers);

    const isInitialized = searchParams.get("isInitialized");
    if (isInitialized) params.set("isInitialized", isInitialized);

    const status = searchParams.get("status");
    if (status) params.set("status", status);

    const sort = searchParams.get("sort");
    if (sort) params.set("sort", sort);

    console.log(
      "[dflow/events] Fetching events with params:",
      params.toString(),
    );

    const response = await dflowMetadataFetch(`/events?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/events] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log(
      "[dflow/events] Fetched",
      data?.events?.length || 0,
      "events",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/events] Failed to fetch events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}
