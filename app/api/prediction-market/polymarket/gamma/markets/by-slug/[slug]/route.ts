import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Get Market by Slug
// Docs: https://docs.polymarket.com/api-reference/markets/get-market-by-slug
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/markets/by-slug/[slug] - Get market by slug
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);

    const queryParams = new URLSearchParams();

    // Optional params
    const includeTag = searchParams.get("include_tag");
    if (includeTag) queryParams.set("include_tag", includeTag);

    const queryString = queryParams.toString();
    const path = `/markets/slug/${slug}${queryString ? `?${queryString}` : ""}`;

    console.log("[polymarket/gamma/markets] Fetching market by slug:", slug);

    const response = await gammaFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[polymarket/gamma/markets] API error:",
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
    console.error("[polymarket/gamma/markets] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch market" },
      { status: 500 }
    );
  }
}
