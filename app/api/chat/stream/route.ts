import { NextResponse } from "next/server";
import { getRun } from "workflow/api";

/**
 * GET /api/chat/stream?runId=xxx
 *
 * Returns a resumable stream of agent reasoning from a workflow run.
 * Used by the frontend to display real-time trading agent activity.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing runId parameter" },
      { status: 400 }
    );
  }

  try {
    const run = await getRun(runId);

    if (!run) {
      return NextResponse.json(
        { error: "Run not found" },
        { status: 404 }
      );
    }

    // Get the readable stream from the workflow run
    const readable = await run.getReadable();

    if (!readable) {
      return NextResponse.json(
        { error: "Stream not available for this run" },
        { status: 404 }
      );
    }

    // Return the stream as Server-Sent Events
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[chat/stream] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to get stream",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/stream
 *
 * Get run status and available stream information
 */
export async function POST(req: Request) {
  try {
    const { runId } = await req.json();

    if (!runId) {
      return NextResponse.json(
        { error: "Missing runId in request body" },
        { status: 400 }
      );
    }

    const run = await getRun(runId);

    if (!run) {
      return NextResponse.json(
        { error: "Run not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      runId,
      status: run.status,
      hasStream: true,
      streamUrl: `/api/chat/stream?runId=${runId}`,
    });
  } catch (error) {
    console.error("[chat/stream] Status check error:", error);
    return NextResponse.json(
      {
        error: "Failed to get run status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
