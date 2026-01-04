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
 *
 * Options:
 *   --model <id>   Only trigger a specific model
 *   --cron         Use cron trigger type
 *   --market       Use market trigger type with mock signal
 *   --check        Just check endpoint status, don't trigger
 *
 * Environment:
 *   WEBHOOK_SECRET - Required for authentication
 *   BASE_URL       - API base URL (default: http://localhost:3000)
 */

import dotenv from "dotenv";
dotenv.config();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
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

interface TriggerResponse {
  success?: boolean;
  error?: string;
  details?: string;
  triggerType?: string;
  completed?: number;
  failed?: number;
  results?: Array<{
    modelId: string;
    status: "completed" | "failed";
    decision?: string;
    trades?: number;
    portfolioValue?: number;
    error?: string;
  }>;
  // Health check response
  status?: string;
  message?: string;
  configuredModels?: number;
  models?: Array<{ id: string; name: string; wallet: string }>;
}

function parseArgs(): {
  modelId?: string;
  triggerType: "market" | "cron" | "manual";
  check: boolean;
} {
  const args = process.argv.slice(2);
  let modelId: string | undefined;
  let triggerType: "market" | "cron" | "manual" = "manual";
  let check = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" && args[i + 1]) {
      modelId = args[++i];
    } else if (arg === "--cron") {
      triggerType = "cron";
    } else if (arg === "--market") {
      triggerType = "market";
    } else if (arg === "--check") {
      check = true;
    }
  }

  return { modelId, triggerType, check };
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
  } else {
    console.log("❌ Endpoint returned unexpected response:", data);
  }
}

async function triggerAgents(
  modelId: string | undefined,
  triggerType: "market" | "cron" | "manual"
): Promise<void> {
  if (!WEBHOOK_SECRET) {
    console.error("❌ WEBHOOK_SECRET environment variable is required");
    console.log("\nSet it in your .env file or run with:");
    console.log(
      "  WEBHOOK_SECRET=your-secret npx tsx scripts/triggerAgents.ts"
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
    console.log(`✅ Trigger successful!`);
    console.log(`   Completed: ${data.completed}`);
    console.log(`   Failed: ${data.failed}`);

    if (data.results && data.results.length > 0) {
      console.log("\nResults:");
      for (const result of data.results) {
        if (result.status === "completed") {
          console.log(
            `  ✅ ${result.modelId}: ${result.decision} (${
              result.trades
            } trades, $${result.portfolioValue?.toFixed(2)})`
          );
        } else {
          console.log(`  ❌ ${result.modelId}: ${result.error}`);
        }
      }
    }
  } else {
    console.log("⚠️ Unexpected response:", data);
  }
}

async function main(): Promise<void> {
  const { modelId, triggerType, check } = parseArgs();

  try {
    if (check) {
      await checkEndpoint();
    } else {
      await triggerAgents(modelId, triggerType);
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
