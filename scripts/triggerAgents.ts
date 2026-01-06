/**
 * Trigger AI Trading Agents
 *
 * This script triggers agent trading workflows via the internal API endpoint.
 * Useful for manual testing and development.
 *
 * Usage:
 *   npx tsx scripts/triggerAgents.ts              # Trigger all agents (manual)
 *   npx tsx scripts/triggerAgents.ts --model X    # Trigger specific model
 *   npx tsx scripts/triggerAgents.ts --cron       # Simulate cron trigger
 *   npx tsx scripts/triggerAgents.ts --market     # Simulate market signal
 *   npx tsx scripts/triggerAgents.ts --poll       # Poll until workflows complete
 *
 * Options:
 *   --model <id>      Only trigger a specific model
 *   --cron            Use cron trigger type
 *   --market          Use market trigger type with mock signal
 *   --check           Just check endpoint status, don't trigger
 *   --poll            Wait for workflows to complete (polls status)
 *   --base-url <url>  Override API base URL (default: http://localhost:3000)
 *
 * Environment:
 *   WEBHOOK_SECRET - Required for authentication
 *   BASE_URL       - API base URL (default: http://localhost:3000)
 */

import dotenv from "dotenv";
dotenv.config();

let BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

interface TriggerRequest {
  modelId?: string;
  signal?: {
    type: string;
    ticker: string;
    timestamp: number;
    data: Record<string, unknown>;
  };
  triggerType: "market" | "cron" | "manual";
}

interface SpawnedWorkflow {
  modelId: string;
  runId: string;
}

interface TriggerResponse {
  success?: boolean;
  error?: string;
  details?: string;
  triggerType?: string;
  spawned?: number;
  failed?: number;
  workflows?: SpawnedWorkflow[];
  errors?: Array<{ modelId: string; error: string }>;
  // Health check response
  status?: string;
  message?: string;
  configuredModels?: number;
  models?: Array<{ id: string; name: string; wallet: string }>;
  endpoints?: Record<string, string>;
}

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

function parseArgs(): {
  modelId?: string;
  triggerType: "market" | "cron" | "manual";
  check: boolean;
  poll: boolean;
  baseUrl?: string;
} {
  const args = process.argv.slice(2);
  let modelId: string | undefined;
  let triggerType: "market" | "cron" | "manual" = "manual";
  let check = false;
  let poll = false;
  let baseUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" && args[i + 1]) {
      modelId = args[++i];
    } else if (arg === "--base-url" && args[i + 1]) {
      baseUrl = args[++i];
    } else if (arg === "--cron") {
      triggerType = "cron";
    } else if (arg === "--market") {
      triggerType = "market";
    } else if (arg === "--check") {
      check = true;
    } else if (arg === "--poll") {
      poll = true;
    }
  }

  return { modelId, triggerType, check, poll, baseUrl };
}

async function checkEndpoint(): Promise<void> {
  console.log("🔍 Checking agent trigger endpoint...\n");

  const response = await fetch(`${BASE_URL}/api/agents/trigger`);
  const data = (await response.json()) as TriggerResponse;

  if (data.status === "ready") {
    console.log("✅ Endpoint is ready");
    console.log(`📊 Configured models: ${data.configuredModels}`);
    console.log("\nModels:");
    for (const model of data.models || []) {
      console.log(`  - ${model.name} (${model.id}) - wallet: ${model.wallet}`);
    }
    if (data.endpoints) {
      console.log("\nEndpoints:");
      for (const [name, desc] of Object.entries(data.endpoints)) {
        console.log(`  ${name}: ${desc}`);
      }
    }
  } else {
    console.log("❌ Endpoint returned unexpected response:", data);
  }
}

async function pollStatus(runIds: string[]): Promise<StatusResponse> {
  const response = await fetch(
    `${BASE_URL}/api/agents/status?runIds=${runIds.join(",")}`,
    {
      headers: {
        Authorization: `Bearer ${WEBHOOK_SECRET}`,
      },
    },
  );
  return (await response.json()) as StatusResponse;
}

async function waitForCompletion(workflows: SpawnedWorkflow[]): Promise<void> {
  const runIds = workflows.map((w) => w.runId);
  const modelMap = new Map(workflows.map((w) => [w.runId, w.modelId]));

  console.log(`\n⏳ Waiting for ${runIds.length} workflow(s) to complete...`);

  const startTime = Date.now();
  const maxWaitMs = 10 * 60 * 1000; // 10 minutes max
  const pollIntervalMs = 3000; // Poll every 3 seconds

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitMs) {
      console.log("\n⚠️ Timeout: Some workflows may still be running");
      break;
    }

    const status = await pollStatus(runIds);
    const { summary } = status;

    // Show progress
    process.stdout.write(
      `\r   Running: ${summary.running} | Completed: ${summary.completed} | Failed: ${summary.failed}    `,
    );

    // Check if all done
    if (summary.running === 0) {
      console.log("\n\n✅ All workflows completed!\n");

      // Show results
      for (const workflow of status.workflows) {
        const modelId = workflow.modelId || modelMap.get(workflow.runId);
        if (workflow.status === "completed") {
          console.log(
            `  ✅ ${modelId}: ${workflow.result?.decision} (${
              workflow.result?.trades
            } trades, $${workflow.result?.portfolioValue?.toFixed(2)})`,
          );
        } else if (workflow.status === "failed") {
          console.log(`  ❌ ${modelId}: ${workflow.result?.error}`);
        } else {
          console.log(`  ⚠️ ${modelId}: ${workflow.status}`);
        }
      }
      break;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

async function triggerAgents(
  modelId: string | undefined,
  triggerType: "market" | "cron" | "manual",
  poll: boolean,
): Promise<void> {
  if (!WEBHOOK_SECRET) {
    console.error("❌ WEBHOOK_SECRET environment variable is required");
    console.log("\nSet it in your .env file or run with:");
    console.log(
      "  WEBHOOK_SECRET=your-secret npx tsx scripts/triggerAgents.ts",
    );
    process.exit(1);
  }

  console.log(`🚀 Triggering agents...`);
  console.log(`   Type: ${triggerType}`);
  console.log(`   Model: ${modelId || "all"}`);
  console.log(`   URL: ${BASE_URL}/api/agents/trigger\n`);

  const body: TriggerRequest = {
    triggerType,
    modelId,
  };

  // Add mock market signal if market trigger
  if (triggerType === "market") {
    body.signal = {
      type: "price_movement",
      ticker: "BTC-USD-PERP",
      timestamp: Date.now(),
      data: {
        price: 50000 + Math.random() * 5000,
        change24h: (Math.random() - 0.5) * 10,
        volume24h: 1_000_000_000,
      },
    };
    console.log(`   Signal: ${body.signal.type} on ${body.signal.ticker}\n`);
  }

  const response = await fetch(`${BASE_URL}/api/agents/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WEBHOOK_SECRET}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as TriggerResponse;

  if (!response.ok) {
    console.error(`❌ Request failed (${response.status}):`, data.error);
    if (data.details) console.error(`   Details: ${data.details}`);
    process.exit(1);
  }

  if (data.success) {
    console.log(`✅ Workflows spawned!`);
    console.log(`   Spawned: ${data.spawned}`);
    console.log(`   Failed: ${data.failed}`);

    if (data.workflows && data.workflows.length > 0) {
      console.log("\nWorkflows:");
      for (const workflow of data.workflows) {
        console.log(`  📋 ${workflow.modelId}: ${workflow.runId}`);
      }

      // Poll for completion if requested
      if (poll && data.workflows.length > 0) {
        await waitForCompletion(data.workflows);
      } else {
        console.log(
          "\n💡 Run with --poll to wait for completion, or check status with:",
        );
        console.log(
          `   curl -H "Authorization: Bearer $WEBHOOK_SECRET" "${BASE_URL}/api/agents/status?runIds=${data.workflows
            .map((w) => w.runId)
            .join(",")}"`,
        );
      }
    }

    if (data.errors && data.errors.length > 0) {
      console.log("\nErrors:");
      for (const err of data.errors) {
        console.log(`  ❌ ${err.modelId}: ${err.error}`);
      }
    }
  } else {
    console.log("⚠️ Unexpected response:", data);
  }
}

async function main(): Promise<void> {
  const { modelId, triggerType, check, poll, baseUrl } = parseArgs();

  // Override BASE_URL if provided via command line
  if (baseUrl) {
    BASE_URL = baseUrl;
  }

  try {
    if (check) {
      await checkEndpoint();
    } else {
      await triggerAgents(modelId, triggerType, poll);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      console.error("❌ Could not connect to the server.");
      console.log(`   Make sure the dev server is running: pnpm dev`);
      console.log(`   Expected URL: ${BASE_URL}`);
    } else {
      console.error("❌ Error:", error);
    }
    process.exit(1);
  }
}

main();
