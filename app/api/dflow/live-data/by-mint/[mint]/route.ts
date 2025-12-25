import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API - Live Data by Mint
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data-by-mint
// ============================================================================

// ============================================================================
// GET /api/dflow/live-data/by-mint/[mint] - Get live data by mint address
// Query params:
//   - minimumStartDate: Minimum start date to filter milestones (RFC3339 format)
//   - category: Filter by milestone category
//   - competition: Filter by competition
//   - sourceId: Filter by source ID
//   - type: Filter by milestone type
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  try {
    const { mint } = await params;

    if (!mint) {
      return NextResponse.json(
        { error: "Mint address is required" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const minimumStartDate = searchParams.get("minimumStartDate");
    const category = searchParams.get("category");
    const competition = searchParams.get("competition");
    const sourceId = searchParams.get("sourceId");
    const type = searchParams.get("type");

    console.log("[dflow/live-data/by-mint] Fetching live data for mint:", mint, {
      minimumStartDate,
      category,
      competition,
      sourceId,
      type,
    });

    // Build query params for dflow API
    const queryParams = new URLSearchParams();
    if (minimumStartDate) queryParams.set("minimumStartDate", minimumStartDate);
    if (category) queryParams.set("category", category);
    if (competition) queryParams.set("competition", competition);
    if (sourceId) queryParams.set("sourceId", sourceId);
    if (type) queryParams.set("type", type);

    const queryString = queryParams.toString();
    const path = `/live_data/by-mint/${encodeURIComponent(mint)}${queryString ? `?${queryString}` : ""}`;

    const response = await dflowMetadataFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/live-data/by-mint] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/live-data/by-mint] Fetched live data for mint:", mint);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/live-data/by-mint] Failed to fetch live data:", error);
    return NextResponse.json(
      { error: "Failed to fetch live data" },
      { status: 500 },
    );
  }
}
