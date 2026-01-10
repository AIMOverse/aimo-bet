import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Get Tag by ID
// Docs: https://docs.polymarket.com/api-reference/tags/get-tag-by-id
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/tags/[id] - Get tag by ID
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    console.log("[polymarket/gamma/tags] Fetching tag by id:", id);

    const response = await gammaFetch(`/tags/${id}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[polymarket/gamma/tags] API error:",
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
    console.error("[polymarket/gamma/tags] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch tag" },
      { status: 500 }
    );
  }
}
