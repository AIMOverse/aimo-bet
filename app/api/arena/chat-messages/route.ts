import { NextResponse } from "next/server";
import { getArenaChatMessages } from "@/lib/supabase/arena";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const limit = searchParams.get("limit");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const isValidUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sessionId
      );
    if (!isValidUUID) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    const messages = await getArenaChatMessages(
      sessionId,
      limit ? parseInt(limit, 10) : 100
    );

    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to fetch arena chat messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
