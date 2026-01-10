import { NextResponse } from "next/server";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";

// ============================================================================
// Polymarket Gamma API - Get Event by ID
// Docs: https://docs.polymarket.com/api-reference/events/get-event-by-id
// ============================================================================

// ============================================================================
// GET /api/polymarket/gamma/events/[id] - Get event by ID
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const queryParams = new URLSearchParams();

    // Optional params
    const includeChat = searchParams.get("include_chat");
    if (includeChat) queryParams.set("include_chat", includeChat);

    const includeTemplate = searchParams.get("include_template");
    if (includeTemplate) queryParams.set("include_template", includeTemplate);

    const queryString = queryParams.toString();
    const path = `/events/${id}${queryString ? `?${queryString}` : ""}`;

    console.log("[polymarket/gamma/events] Fetching event by id:", id);

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
