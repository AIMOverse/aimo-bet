import { NextResponse } from "next/server";
import {
  getSessions,
  getSession,
  updateSession,
  deleteSession,
} from "@/lib/supabase/messages";

// ============================================================================
// GET /api/sessions - List all sessions
// ============================================================================

// Debug: track call frequency
let lastCallTime = 0;
let callCount = 0;

export async function GET(req: Request) {
  const now = Date.now();
  if (now - lastCallTime < 1000) {
    callCount++;
    console.log(`[API /api/sessions] Rapid call #${callCount} within 1s`);
  } else {
    callCount = 1;
    console.log(`[API /api/sessions] First call in new window`);
  }
  lastCallTime = now;
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    // If ID provided, get single session
    if (sessionId) {
      const session = await getSession(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(session);
    }

    // Otherwise, list all sessions
    const sessions = await getSessions();
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
// PATCH /api/sessions - Update a session
// ============================================================================

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { title, modelId } = body;

    if (!title && !modelId) {
      return NextResponse.json(
        { error: "At least one field (title, modelId) is required" },
        { status: 400 },
      );
    }

    await updateSession(sessionId, { title, modelId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update session:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 },
    );
  }
}

// ============================================================================
// DELETE /api/sessions - Delete a session
// ============================================================================

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    await deleteSession(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 },
    );
  }
}
