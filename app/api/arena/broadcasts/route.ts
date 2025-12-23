import { NextResponse } from "next/server";
import { getSessionBroadcasts, createBroadcast } from "@/lib/supabase/arena";
import type { BroadcastType } from "@/types/arena";

// ============================================================================
// GET /api/arena/broadcasts - Get broadcasts for a session
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const broadcasts = await getSessionBroadcasts(sessionId, limit);
    return NextResponse.json(broadcasts);
  } catch (error) {
    console.error("Failed to get broadcasts:", error);
    return NextResponse.json(
      { error: "Failed to get broadcasts" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/arena/broadcasts - Create new broadcast
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, modelId, type, content, relatedTradeId } = body as {
      sessionId: string;
      modelId: string;
      type: BroadcastType;
      content: string;
      relatedTradeId?: string;
    };

    if (!sessionId || !modelId || !type || !content) {
      return NextResponse.json(
        { error: "sessionId, modelId, type, and content are required" },
        { status: 400 }
      );
    }

    if (!["analysis", "trade", "commentary"].includes(type)) {
      return NextResponse.json(
        { error: "type must be one of: analysis, trade, commentary" },
        { status: 400 }
      );
    }

    const broadcast = await createBroadcast(sessionId, modelId, {
      type,
      content,
      relatedTradeId,
    });

    return NextResponse.json(broadcast, { status: 201 });
  } catch (error) {
    console.error("Failed to create broadcast:", error);
    return NextResponse.json(
      { error: "Failed to create broadcast" },
      { status: 500 }
    );
  }
}
