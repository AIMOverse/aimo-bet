import { NextResponse } from "next/server";
import { loadMessages } from "@/lib/supabase/messages";

// ============================================================================
// GET /api/sessions/messages?id={sessionId} - Get messages for a session
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    const messages = await loadMessages(sessionId);
    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to get messages:", error);
    return NextResponse.json(
      { error: "Failed to get messages" },
      { status: 500 }
    );
  }
}
