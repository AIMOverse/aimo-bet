/**
 * Agent Configuration
 *
 * Default agent definitions and fallback agents.
 * These serve as defaults when the API is unavailable.
 */

import type { AgentCatalogItemWithA2A } from "@/types/agents";

/**
 * Default agents (fallback when API unavailable)
 * In production, agents are fetched from the AiMo Network registry.
 */
export const DEFAULT_AGENTS: AgentCatalogItemWithA2A[] = [];

/**
 * Agent categories for filtering
 */
export const AGENT_CATEGORIES = [
  { id: "general", name: "General Purpose" },
  { id: "coding", name: "Coding & Development" },
  { id: "research", name: "Research & Analysis" },
  { id: "creative", name: "Creative & Writing" },
  { id: "data", name: "Data & Analytics" },
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number]["id"];
