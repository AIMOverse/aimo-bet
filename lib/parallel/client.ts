// ============================================================================
// Parallel AI Client
// Search API (synchronous) and Task API (asynchronous with webhook)
// ============================================================================

import {
  PARALLEL_API_KEY,
  PARALLEL_API_URL,
  PARALLEL_TASK_WEBHOOK_URL,
  PARALLEL_MONITOR_WEBHOOK_URL,
} from "@/lib/config";
import type {
  SearchResult,
  TaskRunResponse,
  TaskStatus,
  Processor,
  MonitorConfig,
  MonitorCreateResponse,
  MonitorEventGroup,
  MonitorDetails,
  MonitorListResponse,
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
        url: PARALLEL_TASK_WEBHOOK_URL,
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

// ============================================================================
// Monitor API - Continuous web tracking with scheduled queries
// ============================================================================

/**
 * Create a new monitor for continuous web tracking
 * Returns immediately with monitor_id; events delivered via webhook
 */
export async function createMonitor(
  config: MonitorConfig,
): Promise<MonitorCreateResponse> {
  if (!PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY is not configured");
  }

  const response = await fetch(`${PARALLEL_API_URL}/v1alpha/monitors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": PARALLEL_API_KEY,
    },
    body: JSON.stringify({
      query: config.query,
      cadence: config.cadence,
      metadata: config.metadata,
      webhook: {
        url: PARALLEL_MONITOR_WEBHOOK_URL,
        event_types: [
          "monitor.event.detected",
          "monitor.execution.completed",
          "monitor.execution.failed",
        ],
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Monitor creation failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get monitor details by ID
 */
export async function getMonitor(monitorId: string): Promise<MonitorDetails> {
  if (!PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY is not configured");
  }

  const response = await fetch(
    `${PARALLEL_API_URL}/v1alpha/monitors/${monitorId}`,
    {
      headers: {
        "x-api-key": PARALLEL_API_KEY,
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Get monitor failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * List all monitors
 */
export async function listMonitors(): Promise<MonitorListResponse> {
  if (!PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY is not configured");
  }

  const response = await fetch(`${PARALLEL_API_URL}/v1alpha/monitors`, {
    headers: {
      "x-api-key": PARALLEL_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`List monitors failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Delete a monitor
 */
export async function deleteMonitor(monitorId: string): Promise<void> {
  if (!PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY is not configured");
  }

  const response = await fetch(
    `${PARALLEL_API_URL}/v1alpha/monitors/${monitorId}`,
    {
      method: "DELETE",
      headers: {
        "x-api-key": PARALLEL_API_KEY,
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Delete monitor failed: ${response.status} - ${error}`);
  }
}

/**
 * Get event group details (full event data after webhook notification)
 */
export async function getMonitorEventGroup(
  monitorId: string,
  eventGroupId: string,
): Promise<MonitorEventGroup> {
  if (!PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY is not configured");
  }

  const response = await fetch(
    `${PARALLEL_API_URL}/v1alpha/monitors/${monitorId}/event_groups/${eventGroupId}`,
    {
      headers: {
        "x-api-key": PARALLEL_API_KEY,
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Get event group failed: ${response.status} - ${error}`);
  }

  return response.json();
}
