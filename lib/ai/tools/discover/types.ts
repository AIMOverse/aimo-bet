// ============================================================================
// Exchange & Category Types
// ============================================================================

export type Exchange = "kalshi" | "polymarket";

export type UnifiedCategory =
  | "crypto"
  | "politics"
  | "sports"
  | "economics"
  | "entertainment"
  | "science";

// ============================================================================
// Composite Cursor for Multi-Exchange Pagination
// ============================================================================

export interface CompositeCursor {
  kalshi?: number;
  polymarket?: number;
}

// ============================================================================
// Unified Market Output
// ============================================================================

export interface UnifiedMarket {
  source: Exchange;

  // Display
  question: string;
  event_title?: string;
  category: UnifiedCategory;

  // Exchange-specific identifiers (mutually exclusive)
  kalshi?: {
    market_ticker: string; // Primary ID: "BTCD-25JAN09-B98000"
    event_ticker: string; // Parent event: "BTCD-25JAN09"
    series_ticker: string; // Series: "BTCD-DAILY"
    yes_mint: string;
    no_mint: string;
  };
  polymarket?: {
    market_id: string; // Primary ID
    event_id: string; // Parent event ID
    condition_id: string; // Onchain identifier for resolution
    yes_token_id: string; // Token ID for YES outcome
    no_token_id: string; // Token ID for NO outcome
    slug: string; // URL slug for direct access
  };

  // Market data (unified for comparison)
  outcomes: ["Yes", "No"];
  prices?: { yes: number; no: number };
  volume_24h?: number;
  liquidity?: number;
  status: "active" | "closed" | "resolved";
  end_date?: string;
}

// ============================================================================
// Discovery Result
// ============================================================================

export interface DiscoverMarketResult {
  success: boolean;
  markets: UnifiedMarket[];

  // Pagination
  cursor?: CompositeCursor;
  has_more: boolean;

  // Metadata
  source_breakdown: { kalshi: number; polymarket: number };
  filters_applied: Record<string, unknown>;

  // Error handling
  error?: string;
  suggestion?: string;
}

// ============================================================================
// Exchange-Specific Results (for sub-tools)
// ============================================================================

export interface KalshiMarketResult {
  success: boolean;
  markets: UnifiedMarket[];
  cursor?: number;
  has_more: boolean;
  filters_applied: Record<string, unknown>;
  error?: string;
}

export interface PolymarketMarketResult {
  success: boolean;
  markets: UnifiedMarket[];
  offset?: number;
  has_more: boolean;
  filters_applied: Record<string, unknown>;
  error?: string;
}
