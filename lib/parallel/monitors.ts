// ============================================================================
// Monitor Configuration
// Define news monitors to track for trading signals
// ============================================================================

import type { MonitorConfig, MonitorCadence } from "./types";

/**
 * Monitor definition with local ID for tracking
 */
export interface MonitorDefinition extends MonitorConfig {
  /** Local identifier for this monitor */
  id: string;
  /** Human-readable description */
  description: string;
  /** Whether this monitor is enabled */
  enabled: boolean;
}

/**
 * Predefined news monitors
 *
 * Add monitors here to track specific news topics.
 * These will be created via the setup script or at deploy time.
 *
 * Query tips:
 * - Use natural language, not Boolean operators
 * - Be specific about what changes you want to detect
 * - Focus on actionable, tradeable events
 */
export const MONITORS: MonitorDefinition[] = [
  // Example monitors - customize based on your trading strategy
  // {
  //   id: "crypto-regulatory",
  //   description: "Major cryptocurrency regulatory announcements",
  //   enabled: true,
  //   query: "Extract breaking news about cryptocurrency regulation from SEC, CFTC, or major governments. Focus on enforcement actions, new rules, or policy changes.",
  //   cadence: "hourly",
  //   metadata: { category: "crypto", type: "regulatory" },
  // },
  // {
  //   id: "fed-policy",
  //   description: "Federal Reserve policy decisions and statements",
  //   enabled: true,
  //   query: "Extract news about Federal Reserve interest rate decisions, FOMC meetings, or major policy statements from Fed officials.",
  //   cadence: "hourly",
  //   metadata: { category: "macro", type: "fed" },
  // },
  // {
  //   id: "election-polling",
  //   description: "US election polling and prediction market movements",
  //   enabled: true,
  //   query: "Extract significant changes in US election polling, major endorsements, or notable prediction market movements.",
  //   cadence: "daily",
  //   metadata: { category: "politics", type: "election" },
  // },
];

/**
 * Get all enabled monitors
 */
export function getEnabledMonitors(): MonitorDefinition[] {
  return MONITORS.filter((m) => m.enabled);
}

/**
 * Get monitor by local ID
 */
export function getMonitorById(id: string): MonitorDefinition | undefined {
  return MONITORS.find((m) => m.id === id);
}

/**
 * Get monitors by category (from metadata)
 */
export function getMonitorsByCategory(category: string): MonitorDefinition[] {
  return MONITORS.filter((m) => m.metadata?.category === category);
}

/**
 * Get monitors by cadence
 */
export function getMonitorsByCadence(
  cadence: MonitorCadence
): MonitorDefinition[] {
  return MONITORS.filter((m) => m.cadence === cadence);
}
