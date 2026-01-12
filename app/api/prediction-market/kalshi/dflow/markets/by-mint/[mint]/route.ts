import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Prediction Markets Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/markets/market-by-mint
// ============================================================================

// ============================================================================
// GET /api/dflow/markets/by-mint/[mint] - Get market by mint address
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

    console.log("[dflow/markets/by-mint] Fetching market by mint:", mint);

    const response = await dflowMetadataFetch(
      `/market/by-mint/${encodeURIComponent(mint)}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/markets/by-mint] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/markets/by-mint] Fetched market for mint:", mint);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/markets/by-mint] Failed to fetch market:", error);
    return NextResponse.json(
      { error: "Failed to fetch market by mint" },
      { status: 500 },
    );
  }
}
