import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Tags by Categories
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/tags/tags-by-categories
// ============================================================================

// ============================================================================
// GET /api/dflow/tags - Get tags organized by categories
// Returns a mapping of series categories to their associated tags
// ============================================================================

export async function GET() {
  try {
    console.log("[dflow/tags] Fetching tags by categories");

    const response = await dflowMetadataFetch("/tags_by_categories");

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/tags] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/tags] Fetched tags by categories successfully");

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/tags] Failed to fetch tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 },
    );
  }
}
