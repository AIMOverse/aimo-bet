import { REBALANCE_CONFIG } from "./config";
import type { BalanceState, RebalanceCheck } from "./types";

/**
 * Check if rebalancing is needed based on current balances.
 *
 * Trigger condition:
 * - Polygon < POLYGON_MIN_BALANCE ($10) AND
 * - Solana > SOLANA_RESERVE + BRIDGE_AMOUNT ($20)
 */
export function checkRebalanceNeeded(state: BalanceState): RebalanceCheck {
  const { POLYGON_MIN_BALANCE, SOLANA_RESERVE, BRIDGE_AMOUNT } =
    REBALANCE_CONFIG;

  // Check if Polygon needs funds
  if (state.polygon < POLYGON_MIN_BALANCE) {
    // Check if Solana has surplus (above reserve + bridge amount)
    const solanaAvailable = state.solana - SOLANA_RESERVE;

    if (solanaAvailable >= BRIDGE_AMOUNT) {
      return {
        needed: true,
        direction: "solana_to_polygon",
        amount: BRIDGE_AMOUNT,
        reason: `Polygon balance ($${state.polygon}) below minimum ($${POLYGON_MIN_BALANCE})`,
      };
    } else {
      return {
        needed: false,
        direction: null,
        amount: 0,
        reason: `Polygon low but Solana insufficient (available: $${solanaAvailable.toFixed(2)}, need: $${BRIDGE_AMOUNT})`,
      };
    }
  }

  return {
    needed: false,
    direction: null,
    amount: 0,
    reason: "Balances within thresholds",
  };
}
