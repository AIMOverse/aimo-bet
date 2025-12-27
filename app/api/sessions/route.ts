import { NextResponse } from "next/server";
import {
  getTradingSessions,
  getTradingSession,
  getActiveSession,
  createTradingSession,
  updateSessionStatus,
} from "@/lib/supabase/db";
import type { SessionStatus } from "@/lib/supabase/types";
import { DEFAULT_STARTING_CAPITAL } from "@/lib/config";

// ============================================================================
// GET /api/sessions - List sessions or get active session
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const active = searchParams.get("active");

    // Get active session
    if (active === "true") {
      const session = await getActiveSession();
      return NextResponse.json(session);
    }

    // Get specific session
    if (id) {
      const session = await getTradingSession(id);
      if (!session) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(session);
    }

    // List all sessions
    const sessions = await getTradingSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Failed to get sessions:", error);
    return NextResponse.json(
      { error: "Failed to get sessions" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST /api/sessions - Create new session
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, startingCapital = DEFAULT_STARTING_CAPITAL } = body;

    // Create the session
    const session = await createTradingSession(name, startingCapital);

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PATCH /api/sessions - Update session status
// ============================================================================

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { status } = body as { status: SessionStatus };

    if (
      !status ||
      !["setup", "running", "paused", "completed"].includes(status)
    ) {
      return NextResponse.json(
        {
          error: "Valid status is required (setup, running, paused, completed)",
        },
        { status: 400 },
      );
    }

    await updateSessionStatus(id, status);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update session:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 },
    );
  }
}
