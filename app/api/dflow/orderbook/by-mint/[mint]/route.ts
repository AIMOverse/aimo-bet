import { NextResponse } from "next/server";
import { dflowMetadataFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Orderbook API - By Mint Address
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference/orderbook/orderbook-by-mint
// ============================================================================

// ============================================================================
// GET /api/dflow/orderbook/by-mint/[mint] - Get orderbook by mint address
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

    console.log("[dflow/orderbook/by-mint] Fetching orderbook for mint:", mint);

    const response = await dflowMetadataFetch(
      `/orderbook/by-mint/${encodeURIComponent(mint)}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/orderbook/by-mint] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/orderbook/by-mint] Fetched orderbook for mint:", mint);

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/orderbook/by-mint] Failed to fetch orderbook:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch orderbook" },
      { status: 500 },
    );
  }
}
