/**
 * Test Cron Endpoint
 *
 * This script tests the /api/agents/cron endpoint that Vercel cron jobs call.
 * Useful for testing cron functionality locally or against deployed environments.
 *
 * Usage:
 *   npx tsx scripts/testCron.ts                                    # Test locally
 *   npx tsx scripts/testCron.ts --base-url https://your-app.vercel.app  # Test deployed
 *
 * Options:
 *   --base-url <url>  Override API base URL (default: http://localhost:3000)
 *
 * Environment:
 *   CRON_SECRET - Required for authentication (same as Vercel cron secret)
 */

import dotenv from "dotenv";
dotenv.config();

let BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

interface CronResponse {
  success?: boolean;
  error?: string;
  details?: unknown;
  message?: string;
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
}

function parseArgs(): { baseUrl?: string } {
  const args = process.argv.slice(2);
  let baseUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--base-url" && args[i + 1]) {
      baseUrl = args[++i];
    }
  }

  return { baseUrl };
}

async function testCron(): Promise<void> {
  if (!CRON_SECRET) {
    console.error("❌ CRON_SECRET environment variable is required");
    console.log("\nSet it in your .env file or run with:");
    console.log("  CRON_SECRET=your-secret npx tsx scripts/testCron.ts");
    process.exit(1);
  }

  console.log(`🕐 Testing cron endpoint...`);
  console.log(`   URL: ${BASE_URL}/api/agents/cron\n`);

  const response = await fetch(`${BASE_URL}/api/agents/cron`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
    },
  });

  const data = (await response.json()) as CronResponse;

  if (!response.ok) {
    console.error(`❌ Request failed (${response.status}):`, data.error);
    if (data.details) console.error(`   Details:`, data.details);
    process.exit(1);
  }

  if (data.success) {
    console.log(`✅ Cron job completed successfully!`);
    console.log(`   Message: ${data.message}`);
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
  const { baseUrl } = parseArgs();

  if (baseUrl) {
    BASE_URL = baseUrl;
  }

  try {
    await testCron();
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
