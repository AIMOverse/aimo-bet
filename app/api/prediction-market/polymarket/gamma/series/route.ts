import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Series
// Docs: https://docs.polymarket.com/api-reference/series/list-series
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/series - List series
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
      "closed",
      "include_chat",
      "recurrence",
    ];

    for (const param of allowedParams) {
      const value = searchParams.get(param);
      if (value) params.set(param, value);
    }

    // Array params (comma-separated)
    const arrayParams = ["slug", "categories_ids", "categories_labels"];

    for (const param of arrayParams) {
      const value = searchParams.get(param);
      if (value) params.set(param, value);
    }

    console.log(
      "[polymarket/gamma/series] Fetching with params:",
      params.toString()
    );

    const response = await gammaFetch(`/series?${params}`);

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
    console.log(
      "[polymarket/gamma/series] Fetched",
      data?.length || 0,
      "series"
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("[polymarket/gamma/series] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch series" },
      { status: 500 }
    );
  }
}
