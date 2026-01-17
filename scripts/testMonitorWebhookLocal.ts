#!/usr/bin/env npx tsx
/**
 * Test Monitor Webhook Locally
 *
 * Sends mock webhook payloads directly to your local server to test
 * the webhook handler without needing Parallel's simulate_event API.
 * Uses Standard Webhooks signature format.
 *
 * Usage:
 *   # First, start your dev server: pnpm dev
 *
 *   npx tsx scripts/testMonitorWebhookLocal.ts                          # Test event detected (needs real monitor)
 *   npx tsx scripts/testMonitorWebhookLocal.ts --event-type completed   # Test execution completed
 *   npx tsx scripts/testMonitorWebhookLocal.ts --event-type failed      # Test execution failed
 *   npx tsx scripts/testMonitorWebhookLocal.ts --url http://localhost:3000  # Custom URL
 *   npx tsx scripts/testMonitorWebhookLocal.ts --monitor <id> --event-group <id>  # Use real IDs
 */

import "dotenv/config";
import { createHmac, randomUUID } from "crypto";

const WEBHOOK_SECRET = process.env.PARALLEL_WEBHOOK_SECRET;
const VERCEL_URL = process.env.VERCEL_URL;
const DEFAULT_URL = VERCEL_URL
  ? `https://${VERCEL_URL}/api/parallel/monitor/webhook`
  : "http://localhost:3000/api/parallel/monitor/webhook";

type EventType = "detected" | "completed" | "failed";

interface MockEventData {
  type: string;
  timestamp: string;
  data: {
    monitor_id: string;
    event?: { event_group_id: string };
    metadata?: Record<string, string>;
    error?: string;
  };
}

/**
 * Compute signature per Standard Webhooks spec
 * Payload format: "{webhook-id}.{webhook-timestamp}.{body}"
 */
function computeSignature(
  secret: string,
  webhookId: string,
  webhookTimestamp: string,
  body: string,
): string {
  const payload = `${webhookId}.${webhookTimestamp}.${body}`;
  const digest = createHmac("sha256", secret).update(payload).digest();
  return digest.toString("base64");
}

async function main() {
  const args = process.argv.slice(2);

  const eventType = (getArgValue(args, "--event-type") ||
    "detected") as EventType;
  const webhookUrl = getArgValue(args, "--url") || DEFAULT_URL;

  if (!WEBHOOK_SECRET) {
    console.error("Error: PARALLEL_WEBHOOK_SECRET not set in environment");
    console.error("Add it to your .env file");
    process.exit(1);
  }

  console.log("Testing Monitor Webhook Locally (Standard Webhooks format)");
  console.log("===========================================================");
  console.log(`Webhook URL: ${webhookUrl}`);
  console.log(`Event type: monitor.event.${eventType}`);
  console.log("");

  // Build mock payload
  const payload = buildMockPayload(eventType);
  const body = JSON.stringify(payload);

  // Generate Standard Webhooks headers
  const webhookId = `whevent_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
  const signature = computeSignature(
    WEBHOOK_SECRET,
    webhookId,
    webhookTimestamp,
    body,
  );
  const webhookSignature = `v1,${signature}`;

  console.log("Standard Webhooks headers:");
  console.log(`  webhook-id: ${webhookId}`);
  console.log(`  webhook-timestamp: ${webhookTimestamp}`);
  console.log(`  webhook-signature: ${webhookSignature}`);
  console.log("");
  console.log("Sending payload:");
  console.log(JSON.stringify(payload, null, 2));
  console.log("");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": webhookId,
        "webhook-timestamp": webhookTimestamp,
        "webhook-signature": webhookSignature,
      },
      body,
    });

    const responseText = await response.text();
    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = responseText;
    }

    console.log(`Response status: ${response.status}`);
    console.log("Response body:", JSON.stringify(responseJson, null, 2));

    if (response.ok) {
      console.log("\n✓ Webhook processed successfully");

      if (eventType === "detected" && responseJson.triggered) {
        console.log(`✓ Agents triggered: ${responseJson.spawned || 0}`);
      }
    } else {
      console.log("\n✗ Webhook returned error");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n✗ Failed to send webhook:");
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      console.error("  Connection refused - is your dev server running?");
      console.error("  Start it with: pnpm dev");
    } else {
      console.error(" ", error);
    }
    process.exit(1);
  }
}

function buildMockPayload(eventType: EventType): MockEventData {
  const timestamp = new Date().toISOString();
  const monitorId = "monitor_test_local_" + Date.now();
  const eventGroupId = "event_group_test_" + Date.now();

  switch (eventType) {
    case "detected":
      return {
        type: "monitor.event.detected",
        timestamp,
        data: {
          monitor_id: monitorId,
          event: { event_group_id: eventGroupId },
          metadata: {
            local_id: "test-monitor",
            category: "crypto",
            type: "breaking",
          },
        },
      };

    case "completed":
      return {
        type: "monitor.execution.completed",
        timestamp,
        data: {
          monitor_id: monitorId,
          metadata: {
            local_id: "test-monitor",
            category: "politics",
            type: "daily",
          },
        },
      };

    case "failed":
      return {
        type: "monitor.execution.failed",
        timestamp,
        data: {
          monitor_id: monitorId,
          error: "Test error: simulated failure for local testing",
          metadata: {
            local_id: "test-monitor",
            category: "sports",
            type: "breaking",
          },
        },
      };
  }
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
