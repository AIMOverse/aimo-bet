// ============================================================================
// Parallel AI Client
// Search API (synchronous) and Task API (asynchronous with webhook)
// ============================================================================

import {
  PARALLEL_API_KEY,
  PARALLEL_API_URL,
  PARALLEL_WEBHOOK_URL,
} from "@/lib/config";
import type {
  SearchResult,
  TaskRunResponse,
  TaskStatus,
  Processor,
} from "./types";

// ============================================================================
// Search API - Synchronous web search
// ============================================================================

/**
 * Search API - synchronous web search
 * Always uses agentic mode for token efficiency
 */
export async function search(params: {
  objective: string;
  queries: string[];
  maxResults?: number;
}): Promise<SearchResult> {
  if (!PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY is not configured");
  }

  const response = await fetch(`${PARALLEL_API_URL}/v1beta/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": PARALLEL_API_KEY,
      "parallel-beta": "search-extract-2025-10-10",
    },
    body: JSON.stringify({
      objective: params.objective,
      search_queries: params.queries,
      max_results: params.maxResults ?? 10,
      excerpts: { max_chars_per_result: 10000 },
      mode: "agentic",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Search failed: ${response.status} - ${error}`);
  }

  return response.json();
}

// ============================================================================
// Task API - Asynchronous research with webhook notification
// ============================================================================

/**
 * Task API - asynchronous research with webhook notification
 * Returns immediately with run_id; results delivered via webhook
 */
export async function createResearchTask(params: {
  input: string;
  processor?: Processor;
}): Promise<TaskRunResponse> {
  if (!PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY is not configured");
  }

  const response = await fetch(`${PARALLEL_API_URL}/v1/tasks/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": PARALLEL_API_KEY,
    },
    body: JSON.stringify({
      input: params.input,
      processor: params.processor ?? "pro-fast",
      webhook: {
        url: PARALLEL_WEBHOOK_URL,
        events: ["completed", "failed"],
      },
      task_spec: {
        output_schema: {
          type: "text",
          description: `Comprehensive markdown research report with:
- Executive summary
- Key findings with inline citations
- Risk factors and uncertainties
- Data sources and confidence levels
- Recommendation if applicable`,
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Task creation failed: ${response.status} - ${error}`);
  }

  return response.json();
}

// ============================================================================
// Task Status - Polling fallback
// ============================================================================

/**
 * Get task status - polling fallback if webhook fails
 */
export async function getTaskStatus(runId: string): Promise<TaskStatus> {
  if (!PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY is not configured");
  }

  const response = await fetch(`${PARALLEL_API_URL}/v1/tasks/runs/${runId}`, {
    headers: {
      "x-api-key": PARALLEL_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Task status failed: ${response.status} - ${error}`);
  }

  return response.json();
}
