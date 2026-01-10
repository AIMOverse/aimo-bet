import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Venues API
// Docs: https://pond.dflow.net/swap-api-reference/venues/venues
// ============================================================================

// ============================================================================
// GET /api/dflow/venues - Get list of supported trading venues
// ============================================================================

export async function GET() {
  try {
    console.log("[dflow/venues] Fetching venues");

    const response = await dflowQuoteFetch("/venues");

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/venues] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}`, details: errorText },
        { status: response.status },
      );
    }

    const data = await response.json();

    // Response format: string[] - array of venue names
    console.log("[dflow/venues] Fetched", data?.length || 0, "venues");

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/venues] Failed to fetch venues:", error);
    return NextResponse.json(
      { error: "Failed to fetch venues" },
      { status: 500 },
    );
  }
}
