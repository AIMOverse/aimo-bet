#!/usr/bin/env npx tsx
/**
 * Setup Monitors Script
 *
 * Creates/syncs Parallel AI monitors based on configuration in lib/parallel/monitors.ts
 *
 * Usage:
 *   npx tsx scripts/setupMonitors.ts
 *   npx tsx scripts/setupMonitors.ts --list
 *   npx tsx scripts/setupMonitors.ts --delete-all
 */

import "dotenv/config";
import {
  createMonitor,
  listMonitors,
  deleteMonitor,
  getEnabledMonitors,
} from "@/lib/parallel";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    await listExistingMonitors();
    return;
  }

  if (args.includes("--delete-all")) {
    await deleteAllMonitors();
    return;
  }

  await syncMonitors();
}

/**
 * List all existing monitors
 */
async function listExistingMonitors() {
  console.log("Fetching existing monitors...\n");

  try {
    const response = await listMonitors();

    if (response.monitors.length === 0) {
      console.log("No monitors found.");
      return;
    }

    console.log(`Found ${response.monitors.length} monitor(s):\n`);

    for (const monitor of response.monitors) {
      console.log(`  ID: ${monitor.monitor_id}`);
      console.log(`  Query: ${monitor.query.slice(0, 80)}...`);
      console.log(`  Cadence: ${monitor.cadence}`);
      console.log(`  Status: ${monitor.status}`);
      console.log(`  Created: ${monitor.created_at}`);
      if (monitor.metadata) {
        console.log(`  Metadata: ${JSON.stringify(monitor.metadata)}`);
      }
      console.log("");
    }
  } catch (error) {
    console.error("Failed to list monitors:", error);
    process.exit(1);
  }
}

/**
 * Delete all existing monitors
 */
async function deleteAllMonitors() {
  console.log("Fetching existing monitors to delete...\n");

  try {
    const response = await listMonitors();

    if (response.monitors.length === 0) {
      console.log("No monitors to delete.");
      return;
    }

    console.log(`Deleting ${response.monitors.length} monitor(s)...\n`);

    for (const monitor of response.monitors) {
      console.log(`  Deleting ${monitor.monitor_id}...`);
      await deleteMonitor(monitor.monitor_id);
      console.log(`  Deleted.`);
    }

    console.log("\nAll monitors deleted.");
  } catch (error) {
    console.error("Failed to delete monitors:", error);
    process.exit(1);
  }
}

/**
 * Sync monitors from configuration
 * Creates new monitors for enabled definitions
 */
async function syncMonitors() {
  const enabledMonitors = getEnabledMonitors();

  if (enabledMonitors.length === 0) {
    console.log("No monitors enabled in configuration.");
    console.log("Edit lib/parallel/monitors.ts to add monitor definitions.");
    return;
  }

  console.log(`Creating ${enabledMonitors.length} monitor(s)...\n`);

  const results: Array<{ id: string; monitorId?: string; error?: string }> = [];

  for (const definition of enabledMonitors) {
    console.log(`  Creating: ${definition.id}`);
    console.log(`    Query: ${definition.query.slice(0, 60)}...`);
    console.log(`    Cadence: ${definition.cadence}`);

    try {
      const response = await createMonitor({
        query: definition.query,
        cadence: definition.cadence,
        metadata: {
          ...definition.metadata,
          local_id: definition.id,
        },
      });

      console.log(`    Created: ${response.monitor_id}`);
      results.push({ id: definition.id, monitorId: response.monitor_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(`    Failed: ${message}`);
      results.push({ id: definition.id, error: message });
    }

    console.log("");
  }

  // Summary
  const successful = results.filter((r) => r.monitorId);
  const failed = results.filter((r) => r.error);

  console.log("Summary:");
  console.log(`  Created: ${successful.length}`);
  console.log(`  Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log("\nCreated monitor IDs:");
    for (const r of successful) {
      console.log(`  ${r.id}: ${r.monitorId}`);
    }
  }

  if (failed.length > 0) {
    console.log("\nFailed monitors:");
    for (const r of failed) {
      console.log(`  ${r.id}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
