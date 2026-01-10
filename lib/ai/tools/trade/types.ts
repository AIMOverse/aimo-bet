// ============================================================================
// Trade Tool Types - Shared types for multi-exchange trading
// ============================================================================

import { type KeyPairSigner } from "@solana/kit";
import { type Wallet } from "ethers";

// ============================================================================
// Core Types
// ============================================================================

export type Exchange = "kalshi" | "polymarket";
export type OrderSide = "buy" | "sell";
export type Outcome = "yes" | "no";
export type OrderType = "market" | "limit";
export type TimeInForce = "GTC" | "FOK" | "IOC";
export type OrderStatus = "open" | "filled" | "partial" | "failed";

// ============================================================================
// Signer Types
// ============================================================================

export type KalshiSigner = KeyPairSigner;
export type PolymarketSigner = Wallet;

export interface SignerInfo<T = KalshiSigner | PolymarketSigner> {
  address: string;
  signer: T;
}

/**
 * Lazy signer resolution - allows deferring signer creation until needed
 * and enables per-exchange signer retrieval
 */
export type SignerResolver = <E extends Exchange>(
  exchange: E,
) => Promise<
  SignerInfo<E extends "kalshi" ? KalshiSigner : PolymarketSigner>
>;

// ============================================================================
// Tool Input/Output Types
// ============================================================================

export interface PlaceOrderInput {
  exchange: Exchange;
  /** Market identifier: market_ticker (Kalshi) or token_id (Polymarket) */
  id: string;
  side: OrderSide;
  outcome: Outcome;
  order_type: OrderType;
  /** Number of outcome tokens to trade */
  quantity: number;
  /** Required for limit orders, price per token (0-1) */
  price?: number;
  /** Slippage tolerance in basis points for market orders (default: 200) */
  slippage_bps?: number;
  /** Time in force for limit orders (default: GTC) */
  time_in_force?: TimeInForce;
}

export interface PlaceOrderResult {
  success: boolean;
  /** Prefixed: "kalshi:{signature}" or "polymarket:{orderId}" */
  order_id: string;
  exchange: Exchange;
  status: OrderStatus;
  filled_quantity: number;
  avg_price: number;
  /** USDC spent (buy) or received (sell) */
  total_cost: number;
  error?: string;
}

export interface CancelOrderInput {
  /** Prefixed order ID from placeOrder */
  order_id: string;
}

export interface CancelOrderResult {
  success: boolean;
  order_id: string;
  exchange: Exchange;
  error?: string;
}

// ============================================================================
// Exchange-Specific Result Types
// ============================================================================

export interface KalshiTradeResult {
  success: boolean;
  signature: string;
  inAmount: string;
  outAmount: string;
  executionMode: "sync" | "async";
  error?: string;
}

export interface PolymarketTradeResult {
  success: boolean;
  orderId: string;
  status: "LIVE" | "MATCHED" | "DELAYED" | "UNMATCHED";
  filledSize: number;
  avgPrice: number;
  error?: string;
}
