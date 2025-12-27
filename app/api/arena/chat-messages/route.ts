import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { decisionsToMessages } from "@/lib/supabase/transforms";

/**
 * GET /api/arena/chat-messages
 * Fetch chat messages (agent decisions) for a trading session
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json([]);
  }

  try {
    const { data, error } = await supabase
      .from("agent_decisions")
      .select(
        `
        *,
        agent_sessions!inner(session_id, model_id, model_name),
        agent_trades(id, side, action, quantity, price, notional)
      `
      )
      .eq("agent_sessions.session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[arena/chat-messages] Failed to fetch decisions:", error);
      return NextResponse.json([]);
    }

    // Transform to ChatMessage format
    const messages = decisionsToMessages(
      (data || []).map((row) => ({
        id: row.id as string,
        agent_session_id: row.agent_session_id as string,
        trigger_type: row.trigger_type as string,
        trigger_details: row.trigger_details as Record<string, unknown> | null,
        market_ticker: row.market_ticker as string | null,
        market_title: row.market_title as string | null,
        decision: row.decision as string,
        reasoning: row.reasoning as string,
        confidence: row.confidence as number | null,
        market_context: row.market_context as Record<string, unknown> | null,
        portfolio_value_after: row.portfolio_value_after as number,
        created_at: row.created_at as string,
        agent_sessions: row.agent_sessions as {
          session_id: string;
          model_id: string;
          model_name: string;
        },
        agent_trades: (row.agent_trades as Array<{
          id: string;
          side: "yes" | "no";
          action: "buy" | "sell";
          quantity: number;
          price: number;
          notional: number;
        }>) || [],
      }))
    );

    return NextResponse.json(messages);
  } catch (error) {
    console.error("[arena/chat-messages] Error:", error);
    return NextResponse.json([]);
  }
}
