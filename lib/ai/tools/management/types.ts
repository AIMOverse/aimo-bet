// ============================================================================
// Management Tools Types
// Shared types for multi-exchange management tools (getBalance, getPositions)
// ============================================================================

// ============================================================================
// Exchange Types
// ============================================================================

export type Exchange = "kalshi" | "polymarket";

// ============================================================================
// Signer Interfaces
// ============================================================================

/**
 * Generic signer interface for wallet operations
 * Concrete implementations will differ by chain
 */
export interface Signer {
  address: string;
}

/**
 * Tool signers for multi-exchange operations
 * Contains signers for both SVM (Solana/Kalshi) and EVM (Polygon/Polymarket)
 */
export interface ToolSigners {
  svm: Signer; // Solana signer for Kalshi
  evm: Signer; // Polygon signer for Polymarket
}

// ============================================================================
// Balance Types
// ============================================================================

export interface ChainBalance {
  chain: "solana" | "polygon";
  wallet: string;
  balance: number;
  currency: "USDC" | "USDC.e";
}

export interface GetBalanceResult {
  success: boolean;
  balances: {
    kalshi?: ChainBalance;
    polymarket?: ChainBalance;
  };
  total_balance: number;
  timestamp: string;
  error?: string;
}

// ============================================================================
// Trade Types
// ============================================================================

export interface Trade {
  exchange: Exchange;
  trade_id: string;
  market_id: string;
  asset_id: string;
  side: "buy" | "sell";
  outcome: string;
  size: number;
  price: number;
  fee_rate_bps: number;
  role: "taker" | "maker";
  status: string;
  match_time: string;
  transaction_hash?: string;
}

export interface TradeSummary {
  total_trades: number;
  total_volume: number;
  total_fees: number;
  buys: number;
  sells: number;
}

export interface GetTradesResult {
  success: boolean;
  trades: Trade[];
  summary: TradeSummary;
  error?: string;
}

// ============================================================================
// Position Types
// ============================================================================

export interface Position {
  exchange: Exchange;
  market_id: string;
  market_title: string;
  outcome: "yes" | "no";
  quantity: number;
  avg_price: number;
  current_price?: number;
  current_value?: number;
  pnl?: number;
  pnl_percent?: number;
  status: "active" | "closed";
  redeemable?: boolean;
  proxy_wallet?: string; // Polymarket only
}

export interface PositionSummary {
  total_positions: number;
  active_positions: number;
  closed_positions: number;
  total_value?: number;
  total_pnl?: number;
}

export interface GetPositionsResult {
  success: boolean;
  positions: Position[];
  summary: PositionSummary;
  error?: string;
}
