import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// Cron Job Endpoints for Agent Workflows
// ============================================================================
// Two endpoints for Vercel Cron Jobs:
//
// GET /api/agents/cron - Trigger new agent workflows (every 15-30 min)
// POST /api/agents/cron - Check status of tracked workflows (every 1 min)
//
// Authentication: Requires CRON_SECRET in Authorization header.
//
// Configure in vercel.json:
// {
//   "crons": [
//     { "path": "/api/agents/cron", "schedule": "*/30 * * * *" },
//     { "path": "/api/agents/cron/status", "schedule": "* * * * *" }
//   ]
// }
// ============================================================================

// In-memory storage for tracking active workflow runs
// Note: This is reset on cold starts - consider using KV store for persistence
const activeWorkflows: Map<
  string,
  { runId: string; modelId: string; startedAt: Date }
> = new Map();

/**
 * GET /api/agents/cron
 *
 * Vercel cron job endpoint - triggers all agents periodically.
 * Spawns workflows and tracks run IDs for status polling.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this for cron jobs)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.log("[agents/cron] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[agents/cron] Cron job triggered, spawning workflows");

  try {
    // Call the internal trigger endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/agents/trigger`, {
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

    // Track spawned workflows for status polling
    if (result.workflows) {
      for (const workflow of result.workflows) {
        activeWorkflows.set(workflow.runId, {
          runId: workflow.runId,
          modelId: workflow.modelId,
          startedAt: new Date(),
        });
      }
    }

    console.log(
      `[agents/cron] Spawned ${result.spawned} workflows, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      message: "Workflows spawned",
      spawned: result.spawned,
      failed: result.failed,
      workflows: result.workflows,
      tracking: activeWorkflows.size,
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

/**
 * POST /api/agents/cron
 *
 * Status check cron job - polls status of tracked workflows.
 * Call every minute to update workflow status.
 */
export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.log("[agents/cron/status] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get tracked workflow IDs
  const runIds = Array.from(activeWorkflows.keys());

  if (runIds.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No workflows to check",
      tracking: 0,
    });
  }

  console.log(`[agents/cron/status] Checking ${runIds.length} workflow(s)`);

  try {
    // Poll status endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/agents/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({ runIds }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[agents/cron/status] Status check failed:", result);
      return NextResponse.json(
        { error: "Status check failed", details: result },
        { status: response.status }
      );
    }

    // Remove completed/failed/not_found workflows from tracking
    for (const workflow of result.workflows) {
      if (workflow.status !== "running") {
        const tracked = activeWorkflows.get(workflow.runId);
        if (tracked) {
          console.log(
            `[agents/cron/status] Workflow ${workflow.runId} (${tracked.modelId}): ${workflow.status}`
          );
        }
        activeWorkflows.delete(workflow.runId);
      }
    }

    // Clean up stale workflows (older than 30 minutes)
    const staleThreshold = Date.now() - 30 * 60 * 1000;
    for (const [runId, workflow] of activeWorkflows) {
      if (workflow.startedAt.getTime() < staleThreshold) {
        console.log(
          `[agents/cron/status] Removing stale workflow ${runId} (${workflow.modelId})`
        );
        activeWorkflows.delete(runId);
      }
    }

    console.log(
      `[agents/cron/status] Results: ${result.summary.running} running, ` +
        `${result.summary.completed} completed, ${result.summary.failed} failed, ` +
        `still tracking: ${activeWorkflows.size}`
    );

    return NextResponse.json({
      success: true,
      message: "Status check completed",
      summary: result.summary,
      stillTracking: activeWorkflows.size,
    });
  } catch (error) {
    console.error("[agents/cron/status] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
