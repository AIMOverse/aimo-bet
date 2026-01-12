import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Search
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/search/search
// ============================================================================

// ============================================================================
// GET /api/dflow/search - Search events
// Query params:
//   - q: Search query string (required)
//   - sort: Field for ordering (volume, volume24h, liquidity, openInterest, startDate)
//   - order: Result direction (desc, asc)
//   - limit: Maximum records to return
//   - cursor: Pagination cursor
//   - withNestedMarkets: Include market data within event responses (boolean)
//   - withMarketAccounts: Include settlement mint and redemption status (boolean)
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const sort = searchParams.get("sort");
    const order = searchParams.get("order");
    const limit = searchParams.get("limit");
    const cursor = searchParams.get("cursor");
    const withNestedMarkets = searchParams.get("withNestedMarkets");
    const withMarketAccounts = searchParams.get("withMarketAccounts");

    if (!q) {
      return NextResponse.json(
        { error: "Search query (q) is required" },
        { status: 400 },
      );
    }

    console.log("[dflow/search] Searching events:", {
      q,
      sort,
      order,
      limit,
      cursor,
      withNestedMarkets,
      withMarketAccounts,
    });

    // Build query params for dflow API
    const queryParams = new URLSearchParams();
    queryParams.set("q", q);
    if (sort) queryParams.set("sort", sort);
    if (order) queryParams.set("order", order);
    if (limit) queryParams.set("limit", limit);
    if (cursor) queryParams.set("cursor", cursor);
    if (withNestedMarkets) queryParams.set("withNestedMarkets", withNestedMarkets);
    if (withMarketAccounts) queryParams.set("withMarketAccounts", withMarketAccounts);

    const response = await dflowMetadataFetch(`/search?${queryParams}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/search] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log(
      "[dflow/search] Found",
      data.events?.length ?? 0,
      "events for query:",
      q,
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/search] Failed to search events:", error);
    return NextResponse.json(
      { error: "Failed to search events" },
      { status: 500 },
    );
  }
}
