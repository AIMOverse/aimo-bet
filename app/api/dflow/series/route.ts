import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Series
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/series/series
// ============================================================================

// ============================================================================
// GET /api/dflow/series - Get all series
// Query params:
//   - category: Filter by series category (e.g., Politics, Economics, Entertainment)
//   - tags: Filter by tags (comma-separated list)
//   - isInitialized: Filter series with corresponding market ledger (boolean)
//   - status: Filter by market status (initialized, active, inactive, closed, determined)
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const tags = searchParams.get("tags");
    const isInitialized = searchParams.get("isInitialized");
    const status = searchParams.get("status");

    console.log("[dflow/series] Fetching series:", {
      category,
      tags,
      isInitialized,
      status,
    });

    // Build query params for dflow API
    const queryParams = new URLSearchParams();
    if (category) queryParams.set("category", category);
    if (tags) queryParams.set("tags", tags);
    if (isInitialized) queryParams.set("isInitialized", isInitialized);
    if (status) queryParams.set("status", status);

    const queryString = queryParams.toString();
    const path = queryString ? `/series?${queryString}` : "/series";

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/series] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log(
      "[dflow/series] Fetched",
      Array.isArray(data) ? data.length : 0,
      "series",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/series] Failed to fetch series:", error);
    return NextResponse.json(
      { error: "Failed to fetch series" },
      { status: 500 },
    );
  }
}
