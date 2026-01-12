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
}

/** Response from creating a monitor */
export interface MonitorCreateResponse {
  monitor_id: string;
  status: MonitorStatus;
  created_at: string;
}

/** Single event detected by a monitor */
export interface MonitorEvent {
  /** Summary of the detected change */
  output: string;
  /** When the event was detected */
  event_date: string;
  /** Source URLs for the event */
  source_urls: string[];
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
