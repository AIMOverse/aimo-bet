// ============================================================================
// Analysis Tool Types
// Types for webSearch and deepResearch tools
// ============================================================================

import type { Processor } from "@/lib/parallel/types";

// ============================================================================
// Web Search Types
// ============================================================================

export interface WebSearchInput {
  /** What market is being analyzed (becomes the search objective) */
  market_context: string;
  /** 1-5 specific search queries (max 200 chars each) */
  queries: string[];
  /** Maximum results to return. 1-20, default: 10 */
  max_results?: number;
  /** Freshness preference for results */
  recency?: "day" | "week" | "month" | "any";
}

export interface WebSearchOutput {
  success: boolean;
  search_id: string;
  results: Array<{
    url: string;
    title: string;
    publish_date?: string;
    excerpts: string[];
  }>;
  result_count: number;
  error?: string;
}

// ============================================================================
// Deep Research Types
// ============================================================================

export interface DeepResearchInput {
  /** Natural language research task (max 15,000 chars) */
  research_question: string;
  /** Optional market reference for context */
  market_id?: string;
  /** Optional market title for context */
  market_title?: string;
  /** Processing tier, default: "pro-fast" */
  processor?: Processor;
}

export interface DeepResearchOutput {
  success: boolean;
  /** Task run ID for tracking */
  run_id: string;
  /** Always "pending" - async execution */
  status: "pending";
  /** Status message */
  message: string;
  error?: string;
}
