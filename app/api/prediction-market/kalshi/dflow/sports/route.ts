import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Filters by Sports
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/sports/filters-by-sports
// ============================================================================

// ============================================================================
// GET /api/dflow/sports - Get filtering options by sports
// Returns filtering options available for each sport, including scopes and competitions
// ============================================================================

export async function GET() {
  try {
    console.log("[dflow/sports] Fetching filters by sports");

    const response = await dflowMetadataFetch("/filters_by_sports");

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/sports] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/sports] Fetched filters by sports successfully");

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/sports] Failed to fetch sports filters:", error);
    return NextResponse.json(
      { error: "Failed to fetch sports filters" },
      { status: 500 },
    );
  }
}
