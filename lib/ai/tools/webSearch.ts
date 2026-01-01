// ============================================================================
// Web Search Tool
// Exa AI-powered web search for prediction market research
// ============================================================================

import { webSearch as exaWebSearch } from "@exalabs/ai-sdk";

/**
 * Web search tool powered by Exa AI.
 *
 * Configured for prediction market research with:
 * - Auto search type (best hybrid search)
 * - News category focus for current events
 * - Fresh content via livecrawl
 * - Summaries for quick analysis
 *
 * Requires EXA_API_KEY environment variable.
 */
export const webSearchTool = exaWebSearch({
  type: "auto",
  numResults: 10,
  category: "news",
  contents: {
    text: { maxCharacters: 2000 },
    livecrawl: "preferred",
    summary: true,
  },
});

// Alternative export for flexibility
export { webSearchTool as createWebSearchTool };
