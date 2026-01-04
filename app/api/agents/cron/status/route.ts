import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// Cron Status Check Endpoint
// ============================================================================
// Called by Vercel Cron Jobs every minute to check workflow status.
// Uses in-memory tracking from /api/agents/cron.
//
// Note: Vercel uses GET for cron jobs, so this is a separate endpoint.
// ============================================================================

// Import the shared tracking store
// Since Vercel functions are ephemeral, we use a database for persistence
// For now, this endpoint manually checks recent workflows via status API

/**
 * GET /api/agents/cron/status
 *
 * Vercel cron job endpoint - checks status of recent workflows.
 * Called every minute to monitor workflow progress.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this for cron jobs)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.log("[agents/cron/status] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[agents/cron/status] Status check cron triggered");

  // For now, just log that this ran - actual tracking would need
  // persistent storage (KV, database) since Vercel functions are ephemeral
  //
  // The /api/agents/cron POST endpoint tracks in-memory within a single
  // function invocation. For cross-invocation tracking, use:
  // - Vercel KV
  // - Supabase table for workflow runs
  // - Redis

  return NextResponse.json({
    success: true,
    message: "Status check cron executed",
    note: "For persistent workflow tracking, implement with Vercel KV or database",
    timestamp: new Date().toISOString(),
  });
}
