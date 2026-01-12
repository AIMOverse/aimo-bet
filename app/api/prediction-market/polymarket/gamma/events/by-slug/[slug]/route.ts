import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Get Event by Slug
// Docs: https://docs.polymarket.com/api-reference/events/get-event-by-slug
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/events/by-slug/[slug] - Get event by slug
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
    const includeChat = searchParams.get("include_chat");
    if (includeChat) queryParams.set("include_chat", includeChat);

    const includeTemplate = searchParams.get("include_template");
    if (includeTemplate) queryParams.set("include_template", includeTemplate);

    const queryString = queryParams.toString();
    const path = `/events/slug/${slug}${queryString ? `?${queryString}` : ""}`;

    console.log("[polymarket/gamma/events] Fetching event by slug:", slug);

    const response = await gammaFetch(path);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[polymarket/gamma/events] API error:",
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
    console.error("[polymarket/gamma/events] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch event" },
      { status: 500 }
    );
  }
}
