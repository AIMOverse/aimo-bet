import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Tags
// Docs: https://docs.polymarket.com/api-reference/tags/list-tags
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/tags - List tags
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const params = new URLSearchParams();

    // Required params with defaults
    params.set("limit", searchParams.get("limit") || "100");
    params.set("offset", searchParams.get("offset") || "0");

    // Optional params
    const order = searchParams.get("order");
    if (order) params.set("order", order);

    const ascending = searchParams.get("ascending");
    if (ascending) params.set("ascending", ascending);

    const includeTemplate = searchParams.get("include_template");
    if (includeTemplate) params.set("include_template", includeTemplate);

    const isCarousel = searchParams.get("is_carousel");
    if (isCarousel) params.set("is_carousel", isCarousel);

    console.log(
      "[polymarket/gamma/tags] Fetching with params:",
      params.toString()
    );

    const response = await gammaFetch(`/tags?${params}`);

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
    console.log("[polymarket/gamma/tags] Fetched", data?.length || 0, "tags");

    return NextResponse.json(data);
  } catch (error) {
    console.error("[polymarket/gamma/tags] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
