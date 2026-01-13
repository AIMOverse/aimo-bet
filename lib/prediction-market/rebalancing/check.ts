import { REBALANCE_CONFIG } from "./config";
import type { BalanceState, RebalanceCheck } from "./types";

/**
 * Check if rebalancing is needed based on current balances.
 *
 * Trigger condition:
 * - Polygon < POLYGON_MIN_BALANCE AND
 * - Solana > SOLANA_RESERVE + BRIDGE_AMOUNT
 */
export function checkRebalanceNeeded(state: BalanceState): RebalanceCheck {
  const { POLYGON_MIN_BALANCE, SOLANA_RESERVE, BRIDGE_AMOUNT } =
    REBALANCE_CONFIG;

  // Check if Polygon needs funds
  if (state.polygon < POLYGON_MIN_BALANCE) {
    // Check if Solana has surplus (above reserve + bridge amount)
    const solanaAvailable = state.solana - SOLANA_RESERVE;
    const solanaNeeded = BRIDGE_AMOUNT;

    if (solanaAvailable >= solanaNeeded) {
      return {
        needed: true,
        direction: "solana_to_polygon",
        amount: BRIDGE_AMOUNT,
        reason: `Polygon ($${state.polygon.toFixed(
          2
        )}) below min ($${POLYGON_MIN_BALANCE}), bridging $${BRIDGE_AMOUNT}`,
      };
    } else {
      // Both chains are low - this is expected in dev with small balances
      // Use a different reason to indicate this is not an error condition
      const totalBalance = state.solana + state.polygon;
      return {
        needed: false,
        direction: null,
        amount: 0,
        reason:
          totalBalance < POLYGON_MIN_BALANCE + SOLANA_RESERVE
            ? `Low total balance ($${totalBalance.toFixed(
                2
              )}), rebalancing skipped`
            : `Polygon low ($${state.polygon.toFixed(
                2
              )}) but Solana reserve protected (avail: $${solanaAvailable.toFixed(
                2
              )}, need: $${solanaNeeded})`,
      };
    }
  }

  return {
    needed: false,
    direction: null,
    amount: 0,
    reason: "Balances OK",
  };
}
