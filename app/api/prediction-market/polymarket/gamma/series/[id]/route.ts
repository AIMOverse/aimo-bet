import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Get Series by ID
// Docs: https://docs.polymarket.com/api-reference/series/get-series-by-id
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/series/[id] - Get series by ID
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    console.log("[polymarket/gamma/series] Fetching series by id:", id);

    const response = await gammaFetch(`/series/${id}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[polymarket/gamma/series] API error:",
        response.status,
        errorText
      );
      return NextResponse.json(
        { error: `Gamma API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[polymarket/gamma/series] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch series" },
      { status: 500 }
    );
  }
}
