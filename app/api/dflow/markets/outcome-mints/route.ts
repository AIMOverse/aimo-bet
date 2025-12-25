import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/outcome-mints
// ============================================================================

// ============================================================================
// GET /api/dflow/markets/outcome-mints - Get all outcome mints from supported markets
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const minCloseTs = searchParams.get("minCloseTs");

    // Build query params for dflow API
    const params = new URLSearchParams();
    if (minCloseTs) params.set("minCloseTs", minCloseTs);

    const queryString = params.toString();
    const path = queryString ? `/outcome_mints?${queryString}` : "/outcome_mints";

    console.log("[dflow/markets/outcome-mints] Fetching outcome mints");

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/markets/outcome-mints] API error:",
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
      "[dflow/markets/outcome-mints] Fetched",
      data?.mints?.length || 0,
      "mints",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/markets/outcome-mints] Failed to fetch outcome mints:", error);
    return NextResponse.json(
      { error: "Failed to fetch outcome mints" },
      { status: 500 },
    );
  }
}
