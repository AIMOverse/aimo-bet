// ============================================================================
// Exchange & Category Types
// ============================================================================

export type Exchange = "kalshi" | "polymarket";

export type UnifiedCategory = "crypto" | "politics" | "sports";

// ============================================================================
// Composite Cursor for Multi-Exchange Pagination
// ============================================================================

export interface CompositeCursor {
  kalshi?: number;
  polymarket?: number;
}

// ============================================================================
// discoverMarkets Types
// ============================================================================

export interface MarketSummary {
  source: Exchange;
  id: string;
  question: string;
  category: UnifiedCategory;
  price: { yes: number; no: number };
  volume_24h?: number;
  status: "active" | "closed" | "resolved";
  end_date?: string;
}

export interface DiscoverMarketsResult {
  success: boolean;
  markets: MarketSummary[];
  cursor?: CompositeCursor;
  has_more: boolean;
  source_breakdown: { kalshi: number; polymarket: number };
  error?: string;
}

// ============================================================================
// explainMarket Types
// ============================================================================

export interface RawOrderbook {
  market: string;
  asset_id: string;
  timestamp: string;
  hash: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  min_order_size?: string;
  tick_size?: string;
  neg_risk?: boolean;
}

export interface ExplainMarketResult {
  success: boolean;

  // Identity
  source: Exchange;
  id: string;
  question: string;
  description?: string;

  // Parent context
  event: {
    id: string;
    title: string;
    slug?: string;
    series_ticker?: string;
  };

  // Trading identifiers
  trading: {
    market_ticker?: string;
    yes_mint?: string;
    no_mint?: string;
    condition_id?: string;
    yes_token_id?: string;
    no_token_id?: string;
  };

  // Market state
  prices: { yes: number; no: number };
  volume_24h?: number;
  total_volume?: number;
  liquidity?: number;
  open_interest?: number;

  // Resolution
  resolution: {
    criteria?: string;
    source?: string;
    end_date?: string;
    status: "active" | "closed" | "resolved";
    outcome?: "yes" | "no";
  };

  // Raw order book
  orderbook?: RawOrderbook;

  // Related markets
  related_markets?: Array<{
    id: string;
    question: string;
    price: { yes: number; no: number };
  }>;

  error?: string;
}
