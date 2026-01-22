import { NextRequest, NextResponse } from "next/server";
import { getGlobalSession, updateSessionStatus } from "@/lib/supabase/db";
import type { SessionStatus } from "@/lib/supabase/types";

// ============================================================================
// Admin Season Management Endpoint
// ============================================================================
// Manage the global trading session (season) status.
// Used to end Season 1 and start Season 2, etc.
//
// Authentication: Requires ADMIN_SECRET in Authorization header.
// This should be a separate secret from WEBHOOK_SECRET for admin operations.
// Falls back to WEBHOOK_SECRET if ADMIN_SECRET is not set.
// ============================================================================

interface SeasonStatusResponse {
  success: boolean;
  session: {
    id: string;
    name?: string;
    status: SessionStatus;
    startedAt?: string;
    endedAt?: string;
  };
  message?: string;
}

/**
 * GET /api/admin/season
 *
 * Get current season status.
 */
export async function GET(req: NextRequest) {
  // Verify admin secret
  const authHeader = req.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET || process.env.WEBHOOK_SECRET;
  const expectedToken = `Bearer ${adminSecret}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const session = await getGlobalSession();

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        startedAt: session.startedAt?.toISOString(),
        endedAt: session.endedAt?.toISOString(),
      },
    } satisfies SeasonStatusResponse);
  } catch (error) {
    console.error("[admin/season] Error getting session:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

interface UpdateSeasonRequest {
  action: "end" | "pause" | "resume" | "start";
}

/**
 * POST /api/admin/season
 *
 * Update season status.
 *
 * Actions:
 * - "end": Set status to "completed" (ends the season, stops all triggers)
 * - "pause": Set status to "paused" (temporarily stop triggers)
 * - "resume": Set status to "running" (resume from paused)
 * - "start": Set status to "running" (start a new season)
 */
export async function POST(req: NextRequest) {
  // Verify admin secret
  const authHeader = req.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET || process.env.WEBHOOK_SECRET;
  const expectedToken = `Bearer ${adminSecret}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as UpdateSeasonRequest;
    const { action } = body;

    if (!action || !["end", "pause", "resume", "start"].includes(action)) {
      return NextResponse.json(
        {
          error: "Invalid action",
          validActions: ["end", "pause", "resume", "start"],
        },
        { status: 400 }
      );
    }

    const session = await getGlobalSession();

    // Map action to status
    const statusMap: Record<string, SessionStatus> = {
      end: "completed",
      pause: "paused",
      resume: "running",
      start: "running",
    };

    const newStatus = statusMap[action];

    // Validate state transitions
    if (action === "end" && session.status === "completed") {
      return NextResponse.json({
        success: true,
        session: {
          id: session.id,
          name: session.name,
          status: session.status,
          startedAt: session.startedAt?.toISOString(),
          endedAt: session.endedAt?.toISOString(),
        },
        message: "Season is already ended",
      } satisfies SeasonStatusResponse);
    }

    if (action === "resume" && session.status !== "paused") {
      return NextResponse.json(
        {
          error: `Cannot resume: session is ${session.status}, not paused`,
        },
        { status: 400 }
      );
    }

    // Update the session status
    await updateSessionStatus(session.id, newStatus);

    // Fetch updated session
    const updatedSession = await getGlobalSession();

    const actionMessages: Record<string, string> = {
      end: "Season has been ended. No new agent workflows will be triggered.",
      pause: "Season has been paused. Agent triggers are temporarily stopped.",
      resume: "Season has been resumed. Agent triggers are now active.",
      start: "Season has been started. Agent triggers are now active.",
    };

    console.log(`[admin/season] Season ${action}: ${session.id}`);

    return NextResponse.json({
      success: true,
      session: {
        id: updatedSession.id,
        name: updatedSession.name,
        status: updatedSession.status,
        startedAt: updatedSession.startedAt?.toISOString(),
        endedAt: updatedSession.endedAt?.toISOString(),
      },
      message: actionMessages[action],
    } satisfies SeasonStatusResponse);
  } catch (error) {
    console.error("[admin/season] Error updating session:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
