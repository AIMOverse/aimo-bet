import { NextRequest, NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { createServerClient } from "@/lib/supabase/server";
import type { TradingResult } from "@/lib/ai/workflows/tradingAgent";

// ============================================================================
// Workflow Status Endpoint
// ============================================================================
// Poll the status of running agent workflows by run IDs.
// Use after triggering workflows via /api/agents/trigger.
//
// Authentication: Requires WEBHOOK_SECRET in Authorization header.
//
// Strategy: Since the workflow package doesn't expose completion status,
// we track workflows in a Map and check Supabase for recent decisions.
// When a decision is recorded for a model, we mark that workflow complete.
// ============================================================================

// In-memory tracking of active workflows
// Maps runId -> { modelId, startedAt }
export const activeWorkflowsMap = new Map<
  string,
  { modelId: string; startedAt: Date }
>();

interface WorkflowStatus {
  runId: string;
  modelId?: string;
  status: "running" | "completed" | "failed" | "not_found";
  result?: {
    decision?: string;
    trades?: number;
    portfolioValue?: number;
    error?: string;
  };
}

interface StatusResponse {
  workflows: WorkflowStatus[];
  summary: {
    running: number;
    completed: number;
    failed: number;
    notFound: number;
  };
}

/**
 * Check if a workflow has completed by looking for recent decisions in Supabase.
 */
async function checkWorkflowStatus(runId: string): Promise<WorkflowStatus> {
  try {
    // Check if we're tracking this workflow
    const tracked = activeWorkflowsMap.get(runId);

    if (!tracked) {
      // Not tracked - try to see if the run exists
      try {
        const run = await getRun(runId);
        if (!run) {
          return { runId, status: "not_found" };
        }
        // Run exists but we're not tracking it - assume running
        return { runId, status: "running" };
      } catch {
        return { runId, status: "not_found" };
      }
    }

    const { modelId, startedAt } = tracked;

    // Check Supabase for a decision from this model after the workflow started
    const supabase = createServerClient();
    if (!supabase) {
      // Can't check DB - assume still running
      return { runId, modelId, status: "running" };
    }

    // First get the agent session for this model
    const { data: sessions } = (await supabase
      .from("agent_sessions")
      .select("id")
      .eq("model_id", modelId)
      .limit(1)) as { data: { id: string }[] | null };

    if (!sessions || sessions.length === 0) {
      // No session yet - still running
      return { runId, modelId, status: "running" };
    }

    const agentSessionId = sessions[0].id;

    // Look for decisions created after this workflow started
    const { data: decisions, error } = (await supabase
      .from("agent_decisions")
      .select("id, decision, created_at, portfolio_value_after")
      .eq("agent_session_id", agentSessionId)
      .gte("created_at", startedAt.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)) as {
      data:
        | {
            id: string;
            decision: string;
            created_at: string;
            portfolio_value_after: number;
          }[]
        | null;
      error: Error | null;
    };

    if (error) {
      console.error(`[agents/status] DB error for ${runId}:`, error);
      return { runId, modelId, status: "running" };
    }

    if (decisions && decisions.length > 0) {
      const decision = decisions[0];

      // Count trades for this decision
      const { count: tradesCount } = await supabase
        .from("agent_trades")
        .select("*", { count: "exact", head: true })
        .eq("decision_id", decision.id);

      // Workflow completed - remove from tracking
      activeWorkflowsMap.delete(runId);

      return {
        runId,
        modelId,
        status: "completed",
        result: {
          decision: decision.decision,
          trades: tradesCount || 0,
          portfolioValue: decision.portfolio_value_after,
        },
      };
    }

    // No decision yet - check if workflow has been running too long (10 min timeout)
    const elapsed = Date.now() - startedAt.getTime();
    if (elapsed > 10 * 60 * 1000) {
      activeWorkflowsMap.delete(runId);
      return {
        runId,
        modelId,
        status: "failed",
        result: { error: "Workflow timed out (10 min)" },
      };
    }

    return { runId, modelId, status: "running" };
  } catch (error) {
    console.error(`[agents/status] Error checking ${runId}:`, error);
    return {
      runId,
      status: "failed",
      result: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * GET /api/agents/status
 *
 * Poll workflow status by run IDs.
 * Query params:
 * - runIds: Comma-separated list of workflow run IDs
 */
export async function GET(req: NextRequest) {
  // Verify webhook secret (internal use only)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runIdsParam = req.nextUrl.searchParams.get("runIds");

  if (!runIdsParam) {
    return NextResponse.json(
      { error: "runIds query parameter is required" },
      { status: 400 }
    );
  }

  const runIds = runIdsParam.split(",").filter(Boolean);

  if (runIds.length === 0) {
    return NextResponse.json(
      { error: "No valid runIds provided" },
      { status: 400 }
    );
  }

  console.log(`[agents/status] Checking ${runIds.length} workflow(s)`);

  // Check status of all workflows in parallel
  const statuses = await Promise.all(runIds.map(checkWorkflowStatus));

  // Summarize
  const summary = {
    running: statuses.filter((s) => s.status === "running").length,
    completed: statuses.filter((s) => s.status === "completed").length,
    failed: statuses.filter((s) => s.status === "failed").length,
    notFound: statuses.filter((s) => s.status === "not_found").length,
  };

  console.log(
    `[agents/status] Results: ${summary.running} running, ${summary.completed} completed, ${summary.failed} failed`
  );

  return NextResponse.json({
    workflows: statuses,
    summary,
  } satisfies StatusResponse);
}

/**
 * POST /api/agents/status
 *
 * Alternative: Poll workflow status with run IDs in body.
 * Useful when runIds list is very long.
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret (internal use only)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const runIds: string[] = body.runIds;

  if (!Array.isArray(runIds) || runIds.length === 0) {
    return NextResponse.json(
      { error: "runIds array is required in body" },
      { status: 400 }
    );
  }

  console.log(`[agents/status] Checking ${runIds.length} workflow(s)`);

  // Check status of all workflows in parallel
  const statuses = await Promise.all(runIds.map(checkWorkflowStatus));

  // Summarize
  const summary = {
    running: statuses.filter((s) => s.status === "running").length,
    completed: statuses.filter((s) => s.status === "completed").length,
    failed: statuses.filter((s) => s.status === "failed").length,
    notFound: statuses.filter((s) => s.status === "not_found").length,
  };

  console.log(
    `[agents/status] Results: ${summary.running} running, ${summary.completed} completed, ${summary.failed} failed`
  );

  return NextResponse.json({
    workflows: statuses,
    summary,
  } satisfies StatusResponse);
}
