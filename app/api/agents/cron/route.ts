import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// Cron Job Endpoint for Agent Triggers
// ============================================================================
// Called by Vercel Cron Jobs to periodically trigger all agents.
// Authentication: Requires CRON_SECRET in Authorization header.
//
// Configure in vercel.json:
// {
//   "crons": [{
//     "path": "/api/agents/cron",
//     "schedule": "*/15 * * * *"
//   }]
// }
// ============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

/**
 * GET /api/agents/cron
 *
 * Vercel cron job endpoint - triggers all agents periodically.
 * No request body - just auth header verification.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this for cron jobs)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.log("[agents/cron] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[agents/cron] Cron job triggered, calling /api/agents/trigger");

  try {
    // Call the internal trigger endpoint
    const response = await fetch(`${BASE_URL}/api/agents/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        triggerType: "cron",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[agents/cron] Trigger failed:", result);
      return NextResponse.json(
        { error: "Trigger failed", details: result },
        { status: response.status }
      );
    }

    console.log(
      `[agents/cron] Completed: ${result.completed} succeeded, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      message: "Cron job completed",
      ...result,
    });
  } catch (error) {
    console.error("[agents/cron] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
