import { NextResponse } from "next/server";
import { getChartData } from "@/lib/supabase/agents";

// ============================================================================
// GET /api/performance - Get performance data for a session
// Now fetches from agent_decisions.portfolio_value_after
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const hoursBack = parseInt(searchParams.get("hoursBack") || "24", 10);

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    // Get chart data from agent decisions
    const chartData = await getChartData(sessionId, hoursBack);

    // Transform to the expected format for backwards compatibility
    const snapshots = chartData.map((point) => ({
      id: `${point.timestamp}-${point.modelName}`,
      sessionId,
      modelId: point.modelName, // Using modelName as ID for now
      accountValue: point.portfolioValue,
      timestamp: new Date(point.timestamp),
    }));

    return NextResponse.json(snapshots);
  } catch (error) {
    console.error("Failed to get performance data:", error);
    return NextResponse.json(
      { error: "Failed to get performance data" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST /api/performance - Deprecated
// Performance snapshots are now recorded via agent_decisions
// ============================================================================

export async function POST() {
  return NextResponse.json(
    {
      error: "Deprecated: Performance snapshots are now recorded via agent decisions. Use recordAgentDecision() instead.",
    },
    { status: 410 },
  );
}
