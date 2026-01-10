import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Events
// Docs: https://docs.polymarket.com/api-reference/events/list-events
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/events - List events
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const params = new URLSearchParams();

    // Required params with defaults
    params.set("limit", searchParams.get("limit") || "100");
    params.set("offset", searchParams.get("offset") || "0");

    // Optional params - allowlist
    const allowedParams = [
      "order",
      "ascending",
      "tag_id",
      "tag_slug",
      "active",
      "closed",
      "archived",
      "featured",
      "cyom",
      "related_tags",
      "include_chat",
      "include_template",
      "recurrence",
      "liquidity_min",
      "liquidity_max",
      "volume_min",
      "volume_max",
      "start_date_min",
      "start_date_max",
      "end_date_min",
      "end_date_max",
    ];

    for (const param of allowedParams) {
      const value = searchParams.get(param);
      if (value) params.set(param, value);
    }

    // Array params (comma-separated)
    const arrayParams = ["id", "slug", "exclude_tag_id"];

    for (const param of arrayParams) {
      const value = searchParams.get(param);
      if (value) params.set(param, value);
    }

    console.log(
      "[polymarket/gamma/events] Fetching with params:",
      params.toString()
    );

    const response = await gammaFetch(`/events?${params}`);

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
    console.log(
      "[polymarket/gamma/events] Fetched",
      data?.length || 0,
      "events"
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[polymarket/gamma/events] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
