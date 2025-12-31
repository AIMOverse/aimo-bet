// ============================================================================
// Prediction Market Types
// Shared type definitions for prediction market discovery, retrieval, and redemption
// ============================================================================

// ============================================================================
// Market Status
// ============================================================================

/** Base market status options */
export type MarketStatus =
  | "initialized"
  | "active"
  | "inactive"
  | "closed"
  | "determined";

/** Extended market status including finalized (for redemption) */
export type MarketStatusExtended = MarketStatus | "finalized";

/** Redemption status for a market account */
export type RedemptionStatus = "open" | "pending" | "closed";

// ============================================================================
// Position Types
// ============================================================================

/** Position type for outcome tokens */
export type PositionType = "YES" | "NO" | "UNKNOWN";

// ============================================================================
// Market Accounts
// ============================================================================

/** Base token addresses for a market outcome */
export interface BaseMarketAccounts {
  yesMint: string;
  noMint: string;
}

/** Market accounts with ledger address */
export interface MarketAccounts extends BaseMarketAccounts {
  marketLedger: string;
}

/** Market accounts with redemption info */
export interface MarketAccountsWithRedemption extends MarketAccounts {
  redemptionStatus: RedemptionStatus;
  /** Scalar outcome payout percentage for YES tokens (0-10000 basis points) */
  scalarOutcomePct?: number;
}

// ============================================================================
// Market Data
// ============================================================================

/** Base market data */
export interface BaseMarketData {
  ticker: string;
  title: string;
  subtitle?: string;
}

/** Market data from discovery endpoint */
export interface DiscoveryMarket extends BaseMarketData {
  status: MarketStatus;
  accounts: Record<string, BaseMarketAccounts>;
  volume?: number;
  openInterest?: number;
}

/** Market data from batch/retrieval endpoint */
export interface MarketData extends BaseMarketData {
  eventTicker?: string;
  category?: string;
  status: string;
  accounts: Record<string, MarketAccounts>;
  volume?: number;
  openInterest?: number;
  openTime?: string;
  closeTime?: string;
  expirationTime?: string;
  result?: string;
}

/** Market data with redemption details */
export interface MarketWithRedemption extends BaseMarketData {
  status: MarketStatusExtended;
  /** Market result: "yes", "no", or "" (empty for scalar outcomes) */
  result: string;
  accounts: Record<string, MarketAccountsWithRedemption>;
}

// ============================================================================
// Event & Series Types
// ============================================================================

/** A prediction market event */
export interface Event {
  ticker: string;
  title: string;
  subtitle?: string;
  seriesTicker: string;
  markets?: DiscoveryMarket[];
}

/** Response from the events endpoint */
export interface EventsResponse {
  events: Event[];
  cursor?: string;
}

/** A series (template) for prediction market events */
export interface Series {
  ticker: string;
  title: string;
  category?: string;
  tags?: string[];
  frequency?: string;
}

/** Response from the series endpoint */
export interface SeriesResponse {
  series: Series[];
}

/** Mapping of categories to their tags */
export type TagsByCategories = Record<string, string[]>;

/** Response from the tags_by_categories endpoint */
export interface TagsByCategoriesResponse {
  tagsByCategories: TagsByCategories;
}

// ============================================================================
// Position Types
// ============================================================================

/** A user's position in a prediction market */
export interface UserPosition {
  /** Token mint address for this position */
  mint: string;
  /** Number of outcome tokens held */
  quantity: number;
  /** Token decimals */
  decimals: number;
  /** Position type: YES, NO, or UNKNOWN */
  positionType: PositionType;
  /** Associated market data (null if not found) */
  market: MarketData | null;
}

/** Result from getUserPositions */
export interface UserPositionsResult {
  /** Wallet address queried */
  wallet: string;
  /** Array of positions */
  positions: UserPosition[];
  /** Total number of positions */
  count: number;
  /** Number of resolved positions (market has result) */
  resolvedCount: number;
  /** Number of active positions */
  activeCount: number;
}

// ============================================================================
// Redemption Types
// ============================================================================

/** Result of checking redemption eligibility */
export interface RedemptionEligibility {
  /** Whether the token is redeemable */
  isRedeemable: boolean;
  /** Reason if not redeemable */
  reason?: string;
  /** The outcome mint being checked */
  outcomeMint: string;
  /** Settlement mint to receive (e.g., USDC) */
  settlementMint?: string;
  /** Market data */
  market?: MarketWithRedemption;
  /** Position type (YES or NO) */
  positionType?: "YES" | "NO";
  /** Payout percentage (1.0 for winning outcome, 0-1 for scalar) */
  payoutPct?: number;
}

/** Order response from the Trade API */
export interface RedemptionOrderResponse {
  /** Input amount (outcome tokens) */
  inAmount: string;
  /** Output amount (settlement tokens) */
  outAmount: string;
  /** Input mint (outcome token) */
  inputMint: string;
  /** Output mint (settlement token) */
  outputMint: string;
  /** Base64-encoded transaction */
  transaction: string;
  /** Execution mode: sync or async */
  executionMode: "sync" | "async";
  /** Order ID for async orders */
  orderId?: string;
}

/** A redeemable position with eligibility info */
export interface RedeemablePosition extends UserPosition {
  eligibility: RedemptionEligibility;
}

// ============================================================================
// Token Account Types
// ============================================================================

/** Raw token account data from Solana RPC */
export interface TokenAccount {
  mint: string;
  rawBalance: string;
  balance: number;
  decimals: number;
}
