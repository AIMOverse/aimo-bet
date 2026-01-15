// ============================================================================
// Monitor Configuration
// Define news monitors to track for trading signals
// ============================================================================

import type { MonitorConfig, MonitorCadence } from "./types";
import { NEWS_OUTPUT_SCHEMA } from "./types";

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
  /** Optional output schema for structured responses */
  outputSchema?: object;
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
  // ============================================================================
  // Hourly Monitors (Breaking News) - Trigger rarely, only on major events
  // ============================================================================
  {
    id: "politics-breaking",
    description: "Breaking political news with immediate market impact",
    enabled: true,
    cadence: "hourly",
    metadata: { category: "politics", type: "breaking" },
    outputSchema: NEWS_OUTPUT_SCHEMA,
    query: `Detect ONLY major breaking political news that would immediately move prediction markets:
- Election results or significant polling shifts (5%+ change in major races)
- Major policy announcements (Fed rate decisions, executive orders, Supreme Court rulings)
- Unexpected political events (resignations, major scandals breaking, impeachment news)
- Geopolitical crises (military conflicts, diplomatic incidents, sanctions)
Do NOT report: routine political news, minor updates, opinion pieces, scheduled events, or incremental developments.`,
  },
  {
    id: "sports-breaking",
    description: "Breaking sports news affecting betting markets",
    enabled: true,
    cadence: "hourly",
    metadata: { category: "sports", type: "breaking" },
    outputSchema: NEWS_OUTPUT_SCHEMA,
    query: `Detect ONLY breaking sports news with immediate betting market impact:
- Star player injuries during or immediately before major games
- Unexpected trades of franchise players
- Game cancellations, postponements, or venue changes
- Breaking scandals (suspensions, investigations, doping violations)
- Coaching firings during season
Do NOT report: routine game results, practice reports, minor roster moves, post-game analysis, or scheduled announcements.`,
  },
  {
    id: "crypto-breaking",
    description: "Breaking crypto news with immediate market impact",
    enabled: true,
    cadence: "hourly",
    metadata: { category: "crypto", type: "breaking" },
    outputSchema: NEWS_OUTPUT_SCHEMA,
    query: `Detect ONLY breaking cryptocurrency events with immediate market impact:
- Exchange hacks, exploits, or insolvency announcements
- Major regulatory actions (SEC lawsuits, ETF decisions, country-wide bans)
- Protocol failures, exploits, or security breaches over $10M
- Unexpected institutional moves (major fund purchases, corporate treasury changes)
- Stablecoin depegging events
Do NOT report: normal price fluctuations, routine updates, speculation, or minor protocol upgrades.`,
  },

  // ============================================================================
  // Daily Monitors (Summaries) - Trigger once per day with market overview
  // ============================================================================
  {
    id: "politics-daily",
    description: "Daily political news summary for prediction markets",
    enabled: true,
    cadence: "daily",
    metadata: { category: "politics", type: "daily" },
    outputSchema: NEWS_OUTPUT_SCHEMA,
    query: `Summarize significant political developments relevant to prediction markets:
- Polling trends and changes in major races
- Legislative progress on significant bills
- Campaign developments and endorsements
- Regulatory and policy updates
- International political developments affecting US markets
Focus on actionable intelligence for prediction market trading.`,
  },
  {
    id: "sports-daily",
    description: "Daily sports news summary for betting markets",
    enabled: true,
    cadence: "daily",
    metadata: { category: "sports", type: "daily" },
    outputSchema: NEWS_OUTPUT_SCHEMA,
    query: `Summarize significant sports developments relevant to betting markets:
- Team standings and playoff implications
- Injury reports and player status updates
- Upcoming high-profile matchups
- Team performance trends and streaks
- Trades, signings, and roster changes
Focus on information useful for sports prediction market analysis.`,
  },
  {
    id: "crypto-daily",
    description: "Daily crypto news summary for prediction markets",
    enabled: true,
    cadence: "daily",
    metadata: { category: "crypto", type: "daily" },
    outputSchema: NEWS_OUTPUT_SCHEMA,
    query: `Summarize cryptocurrency market developments relevant to prediction markets:
- Market trends and significant price movements
- Regulatory developments and upcoming decisions
- Protocol upgrades and ecosystem developments
- Institutional activity and adoption news
- Upcoming events (token unlocks, hard forks, governance votes)
Focus on tradeable insights for crypto prediction markets.`,
  },
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
