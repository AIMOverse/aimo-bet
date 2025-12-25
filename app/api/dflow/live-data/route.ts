import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Live Data
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data
// ============================================================================

// ============================================================================
// GET /api/dflow/live-data - Get live data for milestones
// Query params:
//   - milestoneIds: Array of milestone IDs (max 100), comma-separated
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const milestoneIds = searchParams.get("milestoneIds");

    if (!milestoneIds) {
      return NextResponse.json(
        { error: "milestoneIds query parameter is required" },
        { status: 400 },
      );
    }

    // Parse comma-separated IDs
    const idsArray = milestoneIds.split(",").map((id) => id.trim()).filter(Boolean);

    if (idsArray.length === 0) {
      return NextResponse.json(
        { error: "At least one milestone ID is required" },
        { status: 400 },
      );
    }

    if (idsArray.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 milestone IDs allowed" },
        { status: 400 },
      );
    }

    console.log("[dflow/live-data] Fetching live data for milestones:", idsArray.length);

    // Build query params - dflow API expects array format
    const params = new URLSearchParams();
    idsArray.forEach((id) => params.append("milestoneIds", id));

    const response = await dflowMetadataFetch(`/live_data?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/live-data] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/live-data] Fetched live data successfully");

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/live-data] Failed to fetch live data:", error);
    return NextResponse.json(
      { error: "Failed to fetch live data" },
      { status: 500 },
    );
  }
}
