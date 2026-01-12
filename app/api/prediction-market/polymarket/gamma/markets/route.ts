import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Markets
// Docs: https://docs.polymarket.com/api-reference/markets/list-markets
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/markets - List markets
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
      "related_tags",
      "closed",
      "cyom",
      "liquidity_num_min",
      "liquidity_num_max",
      "volume_num_min",
      "volume_num_max",
      "start_date_min",
      "start_date_max",
      "end_date_min",
      "end_date_max",
      "uma_resolution_status",
      "game_id",
      "rewards_min_size",
      "include_tag",
    ];

    for (const param of allowedParams) {
      const value = searchParams.get(param);
      if (value) params.set(param, value);
    }

    // Array params (comma-separated)
    const arrayParams = [
      "id",
      "slug",
      "clob_token_ids",
      "condition_ids",
      "market_maker_address",
      "sports_market_types",
      "question_ids",
    ];

    for (const param of arrayParams) {
      const value = searchParams.get(param);
      if (value) params.set(param, value);
    }

    console.log(
      "[polymarket/gamma/markets] Fetching with params:",
      params.toString()
    );

    const response = await gammaFetch(`/markets?${params}`);

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
    console.log(
      "[polymarket/gamma/markets] Fetched",
      data?.length || 0,
      "markets"
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[polymarket/gamma/markets] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch markets" },
      { status: 500 }
    );
  }
}
