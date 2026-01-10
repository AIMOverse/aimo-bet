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
