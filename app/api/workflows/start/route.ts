import { NextResponse } from "next/server";
import { start, getRun } from "workflow/api";
import { priceWatcherWorkflow } from "@/lib/ai/workflows";

// Singleton run ID for the price watcher
const PRICE_WATCHER_RUN_ID = "price-watcher-singleton";

export async function POST(req: Request) {
  // Verify admin secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if already running
    const existingRun = await getRun(PRICE_WATCHER_RUN_ID);
    if (existingRun && existingRun.status === "running") {
      return NextResponse.json({
        message: "Price watcher already running",
        runId: PRICE_WATCHER_RUN_ID,
        status: existingRun.status,
      });
    }

    // Start the workflow
    const run = await start(priceWatcherWorkflow, [], {
      runId: PRICE_WATCHER_RUN_ID,
    });

    const status = await run.status;

    return NextResponse.json({
      success: true,
      runId: run.runId,
      status,
    });
  } catch (error) {
    console.error("Failed to start price watcher:", error);
    return NextResponse.json(
      {
        error: "Failed to start workflow",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // Verify admin secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existingRun = await getRun(PRICE_WATCHER_RUN_ID);

    if (!existingRun) {
      return NextResponse.json({
        status: "not_running",
        runId: null,
      });
    }

    return NextResponse.json({
      status: existingRun.status,
      runId: PRICE_WATCHER_RUN_ID,
    });
  } catch (error) {
    console.error("Failed to get price watcher status:", error);
    return NextResponse.json(
      {
        error: "Failed to get workflow status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
