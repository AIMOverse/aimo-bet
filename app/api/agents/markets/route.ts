import { NextRequest, NextResponse } from "next/server";
import { getGlobalSession } from "@/lib/supabase/db";
import { getAllAgentMarkets } from "@/lib/supabase/agents";

/**
 * GET /api/agents/markets
 *
 * Returns market tickers that agents hold positions in.
 * Used by PartyKit relays to subscribe to agent-held markets.
 *
 * Query params:
 *   - platform: "polymarket" | "dflow" (optional, returns all if not specified)
 *
 * Authentication: Requires WEBHOOK_SECRET in Authorization header.
 * This endpoint should ONLY be called internally by relays.
 */
export async function GET(req: NextRequest) {
  // Verify webhook secret
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const session = await getGlobalSession();

    // Get platform filter from query params
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") as
      | "polymarket"
      | "dflow"
      | null;

    const markets = await getAllAgentMarkets(session.id, platform || undefined);

    console.log(
      `[agents/markets] Returning ${markets.length} markets for platform=${platform || "all"}`,
    );

    return NextResponse.json({
      markets,
      count: markets.length,
      platform: platform || "all",
    });
  } catch (error) {
    console.error("[agents/markets] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
