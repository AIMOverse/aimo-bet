// ============================================================================
// Parallel AI API Types
// Types for Search API and Task API
// ============================================================================

/**
 * Processor tiers for Task API
 * Trade-off: Standard processors optimize for freshness; fast processors optimize for speed.
 */
export type Processor =
  | "lite"
  | "lite-fast"
  | "base"
  | "base-fast"
  | "core"
  | "core-fast"
  | "core2x"
  | "pro"
  | "pro-fast"
  | "ultra"
  | "ultra-fast"
  | "ultra2x"
  | "ultra4x"
  | "ultra8x";

// ============================================================================
// Search API Types
// ============================================================================

export interface SearchResult {
  search_id: string;
  results: Array<{
    url: string;
    title: string;
    publish_date?: string;
    excerpts: string[];
  }>;
  warnings?: string[];
  usage?: {
    search_units: number;
  };
}

// ============================================================================
// Task API Types
// ============================================================================

export interface TaskRunResponse {
  run_id: string;
}

export interface TaskStatus {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  content?: string;
  basis?: FieldBasis[];
  error?: string;
}

export interface FieldBasis {
  field: string;
  citations: Array<{
    url: string;
    excerpt: string;
  }>;
  confidence: number;
  reasoning: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookPayload {
  run_id: string;
  status: "completed" | "failed";
  content?: string;
  basis?: FieldBasis[];
  error?: string;
}

// ============================================================================
// Research Result (stored in Supabase)
// ============================================================================

export interface ResearchResult {
  id: string;
  run_id: string;
  status: "pending" | "completed" | "failed";
  content?: string;
  basis?: FieldBasis[];
  error?: string;
  created_at: string;
  completed_at?: string;
}

// ============================================================================
// Monitor API Types
// ============================================================================

/** Monitor cadence options */
export type MonitorCadence = "hourly" | "daily" | "weekly";

/** Monitor status */
export type MonitorStatus = "active" | "paused" | "cancelled";

/** Monitor webhook event types */
export type MonitorEventType =
  | "monitor.event.detected"
  | "monitor.execution.completed"
  | "monitor.execution.failed";

/** Monitor configuration for creation */
export interface MonitorConfig {
  /** Natural language query describing what to monitor */
  query: string;
  /** How often to run the monitor */
  cadence: MonitorCadence;
  /** Optional metadata for routing/filtering */
  metadata?: Record<string, string>;
  /** Optional output schema for structured responses */
  outputSchema?: object;
}

/** Response from creating a monitor */
export interface MonitorCreateResponse {
  monitor_id: string;
  status: MonitorStatus;
  created_at: string;
}

/** Structured output from news event monitors */
export interface NewsEventStructuredOutput {
  /** Concise headline summarizing the news event */
  headline: string;
  /** News category */
  category: "politics" | "sports" | "crypto";
  /** Urgency level */
  urgency: "breaking" | "important" | "routine";
  /** Market sentiment implication */
  sentiment: "bullish" | "bearish" | "neutral";
  /** Whether this news is directly tradeable */
  tradeable: "yes" | "no";
  /** Brief description of potential market impact */
  market_impact: string;
}

/** Single event detected by a monitor */
export interface MonitorEvent {
  /** Summary of the detected change */
  output: string;
  /** When the event was detected */
  event_date: string;
  /** Source URLs for the event */
  source_urls: string[];
  /** Structured result if output schema was specified */
  result?: {
    type: string;
    content: NewsEventStructuredOutput;
  };
}

/** Event group containing related events */
export interface MonitorEventGroup {
  event_group_id: string;
  monitor_id: string;
  events: MonitorEvent[];
  created_at: string;
}

/** Webhook payload for monitor.event.detected */
export interface MonitorWebhookPayload {
  type: MonitorEventType;
  timestamp: string;
  data: {
    monitor_id: string;
    event?: {
      event_group_id: string;
    };
    metadata?: Record<string, string>;
    error?: string;
  };
}

/** Monitor details from GET /monitors/{id} */
export interface MonitorDetails {
  monitor_id: string;
  query: string;
  cadence: MonitorCadence;
  status: MonitorStatus;
  metadata?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/** List monitors response */
export interface MonitorListResponse {
  monitors: MonitorDetails[];
}

// ============================================================================
// Structured Output Schemas
// ============================================================================

/** Output schema for news event monitors */
export const NEWS_OUTPUT_SCHEMA = {
  type: "json",
  json_schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        description: "Concise headline summarizing the news event (max 100 chars)",
      },
      category: {
        type: "string",
        description: "News category: politics, sports, or crypto",
      },
      urgency: {
        type: "string",
        description:
          "Urgency level: breaking (rare, immediate impact), important (notable), or routine (minor)",
      },
      sentiment: {
        type: "string",
        description: "Market sentiment implication: bullish, bearish, or neutral",
      },
      tradeable: {
        type: "string",
        description: "Whether this news is directly tradeable on prediction markets: yes or no",
      },
      market_impact: {
        type: "string",
        description: "Brief description of potential prediction market impact (max 200 chars)",
      },
    },
  },
};
