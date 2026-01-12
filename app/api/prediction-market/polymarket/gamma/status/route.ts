import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Status
// Docs: https://docs.polymarket.com/api-reference/gamma-status/gamma-api-health-check
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/status - Health check
// ============================================================================

export async function GET() {
  try {
    console.log("[polymarket/gamma/status] Checking API status");

    const response = await gammaFetch("/status");

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[polymarket/gamma/status] API error:",
        response.status,
        errorText
      );
      return NextResponse.json(
        { error: `Gamma API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.text();
    console.log("[polymarket/gamma/status] Status:", data);

    return NextResponse.json({ status: data });
  } catch (error) {
    console.error("[polymarket/gamma/status] Failed:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}
