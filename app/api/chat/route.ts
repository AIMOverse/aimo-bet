import { NextResponse } from "next/server";
import { start, getRun } from "workflow/api";
import { tradingAgentWorkflow } from "@/lib/ai/workflows/tradingAgent";
import type { TradingInput } from "@/lib/ai/workflows/tradingAgent";
import { decisionsToMessages } from "@/lib/supabase/transforms";
import { createServerClient } from "@/lib/supabase/server";

// ============================================================================
// Unified Chat Endpoint
// ============================================================================
// POST: Trigger trading workflow (from signal)
// GET:  Resume workflow stream (runId) or fetch history (sessionId)
// ============================================================================

/**
 * POST /api/chat
 * Trigger a new trading workflow
 */
export async function POST(req: Request) {
  try {
    const input: TradingInput = await req.json();

    // Validate required fields
    if (!input.modelId || !input.walletAddress) {
      return NextResponse.json(
        { error: "modelId and walletAddress are required" },
        { status: 400 }
      );
    }

    // Ensure priceSwings is an array
    if (!input.priceSwings) {
      input.priceSwings = [];
    }

    console.log(`[/api/chat] Starting trading workflow for ${input.modelId}`);

    // Start the workflow (args must be passed as array)
    const run = await start(tradingAgentWorkflow, [input]);

    // Get the readable stream for streaming response
    const readable = await run.getReadable();

    // Return streaming response with workflow run ID for resumability
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "x-workflow-run-id": run.runId,
      },
    });
  } catch (error) {
    console.error("[/api/chat] POST error:", error);
    return NextResponse.json(
      {
        error: "Failed to start trading workflow",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat
 * Resume workflow stream or fetch history
 *
 * Query params:
 * - runId: Resume a workflow stream
 * - runId + startIndex: Resume from specific position
 * - sessionId: Fetch historical messages
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const sessionId = url.searchParams.get("sessionId");
  const startIndex = url.searchParams.get("startIndex");

  // Resume workflow stream
  if (runId) {
    try {
      const run = await getRun(runId);

      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }

      // Get readable stream with optional start index for resumption
      const readable = await run.getReadable(
        startIndex ? { startIndex: parseInt(startIndex, 10) } : undefined
      );

      if (!readable) {
        return NextResponse.json(
          { error: "Stream not available for this run" },
          { status: 404 }
        );
      }

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (error) {
      console.error("[/api/chat] GET runId error:", error);
      return NextResponse.json(
        {
          error: "Failed to resume stream",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }

  // Fetch historical messages
  if (sessionId) {
    try {
      const messages = await fetchDecisionsAsMessages(sessionId);
      return NextResponse.json(messages);
    } catch (error) {
      console.error("[/api/chat] GET sessionId error:", error);
      return NextResponse.json([], { status: 200 });
    }
  }

  return NextResponse.json(
    { error: "Missing runId or sessionId parameter" },
    { status: 400 }
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Fetch agent decisions and transform to ChatMessage format
 */
async function fetchDecisionsAsMessages(sessionId: string) {
  const supabase = createServerClient();
  if (!supabase) {
    return [];
  }

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
    console.error("[/api/chat] Failed to fetch decisions:", error);
    return [];
  }

  // Transform to ChatMessage format
  return decisionsToMessages(
    (data || []).map((row: Record<string, unknown>) => ({
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
      agent_trades:
        (row.agent_trades as Array<{
          id: string;
          side: "yes" | "no";
          action: "buy" | "sell";
          quantity: number;
          price: number;
          notional: number;
        }>) || [],
    }))
  );
}
