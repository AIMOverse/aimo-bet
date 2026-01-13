/**
 * Shared types for cross-chain rebalancing
 */

export interface BalanceState {
  solana: number;
  polygon: number;
}

export interface RebalanceCheck {
  needed: boolean;
  direction: "solana_to_polygon" | "polygon_to_solana" | null;
  amount: number;
  reason: string;
}

export interface RebalanceResult {
  triggered: boolean;
  direction?: "solana_to_polygon" | "polygon_to_solana";
  amount?: number;
  reason: string;
}
