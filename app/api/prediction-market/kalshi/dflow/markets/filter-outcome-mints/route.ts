import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/filter-outcome-mints
// ============================================================================

// ============================================================================
// POST /api/dflow/markets/filter-outcome-mints - Filter addresses for outcome mints
// Max 200 addresses per request
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { addresses } = body;

    if (!addresses) {
      return NextResponse.json(
        { error: "addresses is required" },
        { status: 400 },
      );
    }

    if (!Array.isArray(addresses)) {
      return NextResponse.json(
        { error: "addresses must be an array" },
        { status: 400 },
      );
    }

    if (addresses.length > 200) {
      return NextResponse.json(
        { error: "Maximum 200 addresses allowed per request" },
        { status: 400 },
      );
    }

    console.log(
      "[dflow/markets/filter-outcome-mints] Filtering",
      addresses.length,
      "addresses",
    );

    const response = await dflowMetadataFetch("/filter_outcome_mints", {
      method: "POST",
      body: JSON.stringify({ addresses }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/markets/filter-outcome-mints] API error:",
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
      "[dflow/markets/filter-outcome-mints] Found",
      data?.outcomeMints?.length || 0,
      "outcome mints",
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/markets/filter-outcome-mints] Failed to filter outcome mints:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to filter outcome mints" },
      { status: 500 },
    );
  }
}
