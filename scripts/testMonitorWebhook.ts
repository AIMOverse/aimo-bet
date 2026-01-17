#!/usr/bin/env npx tsx
/**
 * Test Monitor Webhook Integration
 *
 * Simulates monitor events to test the webhook integration pipeline.
 * Uses Parallel's simulate_event API to send test events to your webhook.
 *
 * Usage:
 *   npx tsx scripts/testMonitorWebhook.ts                    # List monitors and prompt for selection
 *   npx tsx scripts/testMonitorWebhook.ts --monitor <id>     # Simulate event for specific monitor
 *   npx tsx scripts/testMonitorWebhook.ts --all              # Simulate events for all monitors
 *   npx tsx scripts/testMonitorWebhook.ts --event-type <type> # Specify event type
 *
 * Event types:
 *   - monitor.event.detected (default) - Simulates news detection, triggers full webhook flow
 *   - monitor.execution.completed - Simulates completed run with no events
 *   - monitor.execution.failed - Simulates failed execution
 *
 * Note: Simulated events include a test event_group_id. The webhook will fetch dummy
 * event data from Parallel API to verify the full processing pipeline.
 */

import "dotenv/config";
import { listMonitors, simulateMonitorEvent } from "@/lib/parallel";
import type { MonitorDetails } from "@/lib/parallel";

type EventType =
  | "monitor.event.detected"
  | "monitor.execution.completed"
  | "monitor.execution.failed";

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const monitorIdArg = getArgValue(args, "--monitor");
  const simulateAll = args.includes("--all");
  const eventType = (getArgValue(args, "--event-type") ||
    "monitor.event.detected") as EventType;

  // Validate event type
  const validEventTypes = [
    "monitor.event.detected",
    "monitor.execution.completed",
    "monitor.execution.failed",
  ];
  if (!validEventTypes.includes(eventType)) {
    console.error(`Invalid event type: ${eventType}`);
    console.error(`Valid types: ${validEventTypes.join(", ")}`);
    process.exit(1);
  }

  // Fetch existing monitors
  console.log("Fetching monitors from Parallel API...\n");
  const monitors = await listMonitors();

  if (monitors.length === 0) {
    console.log("No monitors found. Create monitors first with:");
    console.log("  npx tsx scripts/setupMonitors.ts");
    process.exit(1);
  }

  // Filter to active monitors only
  const activeMonitors = monitors.filter((m) => m.status === "active");

  if (activeMonitors.length === 0) {
    console.log(
      "No active monitors found. All monitors are paused or cancelled.",
    );
    process.exit(1);
  }

  console.log(`Found ${activeMonitors.length} active monitor(s):\n`);
  displayMonitors(activeMonitors);

  // Determine which monitors to simulate
  let monitorsToSimulate: MonitorDetails[] = [];

  if (monitorIdArg) {
    const monitor = activeMonitors.find((m) => m.monitor_id === monitorIdArg);
    if (!monitor) {
      console.error(`\nMonitor not found: ${monitorIdArg}`);
      console.error("Use one of the monitor IDs listed above.");
      process.exit(1);
    }
    monitorsToSimulate = [monitor];
  } else if (simulateAll) {
    monitorsToSimulate = activeMonitors;
  } else {
    // Interactive mode - prompt user
    console.log("\nTo simulate an event, run with:");
    console.log(
      `  npx tsx scripts/testMonitorWebhook.ts --monitor <monitor_id>`,
    );
    console.log(`  npx tsx scripts/testMonitorWebhook.ts --all`);
    console.log("\nOptionally specify event type:");
    console.log(`  --event-type monitor.event.detected (default)`);
    console.log(`  --event-type monitor.execution.completed`);
    console.log(`  --event-type monitor.execution.failed`);
    return;
  }

  // Simulate events
  console.log(
    `\nSimulating ${eventType} for ${monitorsToSimulate.length} monitor(s)...\n`,
  );

  let successCount = 0;
  let failCount = 0;

  for (const monitor of monitorsToSimulate) {
    const label = monitor.metadata?.local_id || monitor.monitor_id;
    console.log(`  [${label}] Simulating ${eventType}...`);

    try {
      await simulateMonitorEvent(monitor.monitor_id, eventType);
      console.log(`  [${label}] Event sent successfully`);
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`  [${label}] Failed: ${message}`);
      failCount++;
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);

  if (successCount > 0) {
    console.log("\nNext steps:");
    console.log("  1. Check your webhook endpoint logs for incoming requests");
    console.log("  2. Verify the webhook processes the event correctly");
    console.log(
      "  3. Check if agents were triggered (for monitor.event.detected)",
    );
    console.log("\nWebhook endpoint:");
    console.log(
      `  ${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/api/parallel/monitor/webhook`,
    );
  }

  if (failCount > 0) {
    process.exit(1);
  }
}

function displayMonitors(monitors: MonitorDetails[]) {
  for (const monitor of monitors) {
    const localId = monitor.metadata?.local_id || "unknown";
    const category = monitor.metadata?.category || "unknown";
    const type = monitor.metadata?.type || "unknown";

    console.log(`  ID: ${monitor.monitor_id}`);
    console.log(`  Local ID: ${localId}`);
    console.log(`  Category: ${category}, Type: ${type}`);
    console.log(`  Cadence: ${monitor.cadence}`);
    console.log(`  Query: ${monitor.query.slice(0, 70)}...`);
    console.log("");
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
