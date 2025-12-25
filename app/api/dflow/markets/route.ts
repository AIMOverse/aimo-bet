import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/markets
// ============================================================================

// ============================================================================
// GET /api/dflow/markets - Get list of prediction markets
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "active";
    const limit = searchParams.get("limit") || "20";
    const cursor = searchParams.get("cursor");
    const isInitialized = searchParams.get("isInitialized");
    const sort = searchParams.get("sort");
    const order = searchParams.get("order");

    // Build query params for dflow API
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("limit", limit);
    if (cursor) params.set("cursor", cursor);
    if (isInitialized) params.set("isInitialized", isInitialized);
    if (sort) params.set("sort", sort);
    if (order) params.set("order", order);

    console.log(
      "[dflow/markets] Fetching markets with params:",
      params.toString(),
    );

    const response = await dflowMetadataFetch(`/markets?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/markets] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/markets] Fetched", data?.length || 0, "markets");

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/markets] Failed to fetch markets:", error);
    return NextResponse.json(
      { error: "Failed to fetch markets" },
      { status: 500 },
    );
  }
}
