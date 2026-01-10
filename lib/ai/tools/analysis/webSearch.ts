// ============================================================================
// webSearch Tool
// Fast web search using Parallel Search API
// Optimized for quick lookups during agent execution
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { search } from "@/lib/parallel/client";
import type { WebSearchOutput } from "./types";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build search objective from market context and recency preference
 */
function buildObjective(marketContext: string, recency: string): string {
  const recencyText =
    recency === "day"
      ? "from the past 24 hours"
      : recency === "week"
        ? "from the past week"
        : recency === "month"
          ? "from the past month"
          : "";

  if (recencyText) {
    return `Find news and information ${recencyText} about: ${marketContext}`;
  }
  return `Find relevant information about: ${marketContext}`;
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Web Search Tool
 * Quick web search for news, sentiment, and recent events
 */
export const webSearchTool = tool({
  description:
    "Fast web search for recent news, sentiment, and events related to a prediction market. " +
    "Returns LLM-optimized excerpts from search results. " +
    "Use for quick information gathering before making trading decisions.",
  inputSchema: z.object({
    market_context: z
      .string()
      .describe(
        "What market is being analyzed. This becomes the search objective."
      ),
    queries: z
      .array(z.string().max(200))
      .min(1)
      .max(5)
      .describe("1-5 specific search queries (max 200 chars each)"),
    max_results: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe("Maximum results to return. Default: 10"),
    recency: z
      .enum(["day", "week", "month", "any"])
      .optional()
      .default("week")
      .describe("Freshness preference for results. Default: week"),
  }),
  execute: async ({
    market_context,
    queries,
    max_results = 10,
    recency = "week",
  }): Promise<WebSearchOutput> => {
    console.log("[webSearch] Executing:", {
      market_context,
      queries,
      max_results,
      recency,
    });

    try {
      const objective = buildObjective(market_context, recency);

      const searchResult = await search({
        objective,
        queries,
        maxResults: max_results,
      });

      console.log("[webSearch] Found:", {
        search_id: searchResult.search_id,
        result_count: searchResult.results.length,
      });

      return {
        success: true,
        search_id: searchResult.search_id,
        results: searchResult.results.map((r) => ({
          url: r.url,
          title: r.title,
          publish_date: r.publish_date,
          excerpts: r.excerpts,
        })),
        result_count: searchResult.results.length,
      };
    } catch (error) {
      console.error("[webSearch] Error:", error);
      return {
        success: false,
        search_id: "",
        results: [],
        result_count: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================================================
// Factory Function (for dependency injection)
// ============================================================================

/**
 * Create a web search tool instance
 * Factory pattern for potential future customization
 */
export function createWebSearchTool() {
  return webSearchTool;
}
