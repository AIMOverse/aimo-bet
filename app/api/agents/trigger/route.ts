import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
import {
  tradingAgentWorkflow,
  type TradingInput,
} from "@/lib/ai/workflows/tradingAgent";
import { activeWorkflowsMap } from "@/app/api/agents/status/route";
import { getGlobalSession } from "@/lib/supabase/db";
import { getAgentsHoldingTicker } from "@/lib/supabase/agents";

// ============================================================================
// Agent Trigger Endpoint (Workflow-based)
// ============================================================================
// Internal webhook to spawn agent workflows. Returns immediately with run IDs.
// Called by: PartyKit relay (market signals), cron jobs, manual triggers.
//
// Authentication: Requires WEBHOOK_SECRET in Authorization header.
// This endpoint should ONLY be called internally - never exposed to public.
//
// Clients can poll /api/agents/status?runIds=... to check workflow status.
// ============================================================================

export type TriggerType = "market" | "cron" | "manual" | "research_complete";

/**
 * Market signal from PartyKit relay
 * Used for triggering agents and filtering by position
 * Note: Signals are NOT passed to the LLM prompt (for KV cache optimization)
 */
export type MarketSignalType =
  | "price_swing"
  | "volume_spike"
  | "orderbook_imbalance"
  | "position_flip";

export interface MarketSignal {
  type: MarketSignalType;
  ticker: string;
  platform?: "dflow" | "polymarket";
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * Research payload from Parallel webhook
 * Delivered when async research task completes
 */
export interface ResearchPayload {
  run_id: string;
  status: "completed" | "failed";
  content?: string;
  basis?: Array<{
    field: string;
    citations: Array<{ url: string; excerpt: string }>;
    confidence: number;
    reasoning: string;
  }>;
  error?: string;
}

interface TriggerRequest {
  /** Specific model to trigger (omit to trigger all enabled models) */
  modelId?: string;
  /** Market signal data (for market-triggered runs) */
  signal?: MarketSignal;
  /** What initiated this trigger */
  triggerType: TriggerType;
  /** When true, only trigger agents holding a position in signal.ticker */
  filterByPosition?: boolean;
  /** Research payload (present when triggerType === "research_complete") */
  research?: ResearchPayload;
}

interface SpawnedWorkflow {
  modelId: string;
  runId: string;
}

interface TriggerResponse {
  success: boolean;
  triggerType: TriggerType;
  signal?: { type: string; ticker?: string };
  spawned: number;
  failed: number;
  workflows: SpawnedWorkflow[];
  errors: Array<{ modelId: string; error: string }>;
  message?: string;
}

/**
 * POST /api/agents/trigger
 *
 * Spawn trading agent workflows for one or all models.
 * Returns immediately with run IDs - workflows execute in background.
 * Poll /api/agents/status to check completion.
 *
 * Note: Market signals are used for triggering/filtering only.
 * The LLM receives a static prompt for KV cache optimization.
 *
 * Season Guard: Will not trigger agents if session status is "completed".
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret (internal use only)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if season is still active
    const session = await getGlobalSession();
    if (session.status === "completed" || session.status === "paused") {
      const reason =
        session.status === "completed"
          ? "Season has ended"
          : "Season is paused";
      console.log(`[agents/trigger] ${reason}, rejecting trigger request`);
      return NextResponse.json({
        success: false,
        triggerType: "manual",
        spawned: 0,
        failed: 0,
        workflows: [],
        errors: [],
        message: `${reason}. No new agent workflows will be triggered.`,
      } satisfies TriggerResponse);
    }

    const body = (await req.json()) as TriggerRequest;
    const {
      modelId,
      signal,
      triggerType = "manual",
      filterByPosition = false,
      research,
    } = body;

    console.log(
      `[agents/trigger] Received trigger: type=${triggerType}, modelId=${
        modelId || "all"
      }, signal=${signal?.type || "none"}, filterByPosition=${filterByPosition}`,
    );

    // Log position flip signals distinctly
    if (signal?.type === "position_flip") {
      const flipData = signal.data as {
        flipDirection?: string;
        previousPrice?: number;
        currentPrice?: number;
      };
      console.log(
        `[agents/trigger] Position flip: ${signal.ticker} ${flipData.flipDirection || "unknown"} ` +
          `(${flipData.previousPrice?.toFixed(3) || "?"} -> ${flipData.currentPrice?.toFixed(3) || "?"}) ` +
          `platform=${signal.platform || "unknown"}`,
      );
    }

    // Get models to trigger
    const allModels = getModelsWithWallets();

    if (allModels.length === 0) {
      return NextResponse.json({
        success: true,
        triggerType,
        spawned: 0,
        failed: 0,
        workflows: [],
        errors: [],
      } satisfies TriggerResponse);
    }

    // Filter to specific model if requested
    const modelsToTrigger = modelId
      ? allModels.filter((m) => m.id === modelId)
      : allModels;

    if (modelsToTrigger.length === 0) {
      return NextResponse.json(
        { error: `Model not found: ${modelId}` },
        { status: 404 },
      );
    }

    // Filter to only agents holding the signaled ticker (for position-based triggers)
    let filteredModels = modelsToTrigger;

    if (filterByPosition && signal?.ticker) {
      const session = await getGlobalSession();
      const holdingModelIds = await getAgentsHoldingTicker(
        session.id,
        signal.ticker,
      );

      filteredModels = modelsToTrigger.filter((m) =>
        holdingModelIds.includes(m.id),
      );

      console.log(
        `[agents/trigger] Position filter: ${holdingModelIds.length} agents hold ${signal.ticker}, ` +
          `triggering ${filteredModels.length} of ${modelsToTrigger.length}`,
      );

      if (filteredModels.length === 0) {
        return NextResponse.json({
          success: true,
          triggerType,
          signal: { type: signal.type, ticker: signal.ticker },
          spawned: 0,
          failed: 0,
          workflows: [],
          errors: [],
          message: `No agents hold position in ${signal.ticker}`,
        } satisfies TriggerResponse);
      }
    }

    // Spawn workflows for all models in parallel
    const results = await Promise.allSettled(
      filteredModels.map(async (model): Promise<SpawnedWorkflow> => {
        // Check if agent already has active workflow (one workflow per agent at a time)
        const existingRun = Array.from(activeWorkflowsMap.entries()).find(
          ([, meta]) => meta.modelId === model.id,
        );

        if (existingRun) {
          console.log(
            `[agents/trigger] Skipping ${model.id}, workflow already running: ${existingRun[0]}`,
          );
          throw new Error("Workflow already running");
        }

        // Note: Signal is NOT passed to workflow (KV cache optimization)
        // Agent uses static prompt and fetches balance via tool
        // Research is passed when triggered by research_complete
        const input: TradingInput = {
          modelId: model.id,
          walletAddress: model.walletAddress!,
          research: triggerType === "research_complete" ? research : undefined,
        };

        // Start workflow (returns immediately, executes in background)
        const run = await start(tradingAgentWorkflow, [input]);

        // Track this workflow for status polling
        activeWorkflowsMap.set(run.runId, {
          modelId: model.id,
          startedAt: new Date(),
        });

        console.log(
          `[agents/trigger] Spawned workflow for ${model.id}: ${run.runId}`,
        );

        return {
          modelId: model.id,
          runId: run.runId,
        };
      }),
    );

    // Collect results
    const workflows: SpawnedWorkflow[] = [];
    const errors: Array<{ modelId: string; error: string }> = [];

    results.forEach((result, index) => {
      const model = filteredModels[index];
      if (result.status === "fulfilled") {
        workflows.push(result.value);
      } else {
        errors.push({
          modelId: model.id,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error",
        });
      }
    });

    console.log(
      `[agents/trigger] Spawned ${workflows.length} workflows, ${errors.length} failed`,
    );

    return NextResponse.json({
      success: true,
      triggerType,
      signal: signal ? { type: signal.type, ticker: signal.ticker } : undefined,
      spawned: workflows.length,
      failed: errors.length,
      workflows,
      errors,
    } satisfies TriggerResponse);
  } catch (error) {
    console.error("[agents/trigger] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/agents/trigger
 *
 * Health check / info endpoint for the trigger service.
 */
export async function GET() {
  const models = getModelsWithWallets();

  return NextResponse.json({
    status: "ready",
    message: "Agent trigger endpoint spawns workflows (non-blocking)",
    configuredModels: models.length,
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      wallet: m.walletAddress?.slice(0, 8) + "...",
    })),
    endpoints: {
      trigger: "POST /api/agents/trigger - Spawn workflows, returns run IDs",
      status: "GET /api/agents/status?runIds=... - Poll workflow status",
      cron: "GET /api/agents/cron - Vercel cron job",
    },
  });
}
