// ============================================================================
// Cancel Order Tool
// Cancel open orders (Polymarket only)
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type Wallet } from "ethers";

import { createClobClient } from "@/lib/prediction-market/polymarket/clob";
import { cancelOrder as cancelPolymarketOrder } from "@/lib/prediction-market/polymarket/trade";

import type { CancelOrderResult, Exchange } from "./types";

// ============================================================================
// Order ID Parsing
// ============================================================================

/**
 * Parse a prefixed order ID to extract exchange and raw order ID
 *
 * @param prefixedOrderId - Order ID with exchange prefix (e.g., "polymarket:abc123")
 * @returns Parsed exchange and order ID, or null if invalid format
 */
function parseOrderId(
  prefixedOrderId: string,
): { exchange: Exchange; orderId: string } | null {
  if (prefixedOrderId.startsWith("kalshi:")) {
    return { exchange: "kalshi", orderId: prefixedOrderId.slice(7) };
  }
  if (prefixedOrderId.startsWith("polymarket:")) {
    return { exchange: "polymarket", orderId: prefixedOrderId.slice(11) };
  }
  return null;
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create cancelOrder tool bound to Polymarket wallet
 *
 * @param polymarketWallet - ethers Wallet for Polymarket trades (optional)
 */
export function createCancelOrderTool(polymarketWallet?: Wallet) {
  return tool({
    description:
      "Cancel an open order. Only Polymarket orders can be cancelled. " +
      "Kalshi orders are executed immediately and cannot be cancelled. " +
      "Use the order_id returned from placeOrder.",
    inputSchema: z.object({
      order_id: z
        .string()
        .describe(
          "Prefixed order ID from placeOrder (e.g., 'polymarket:abc123')",
        ),
    }),
    execute: async ({ order_id }): Promise<CancelOrderResult> => {
      console.log("[cancelOrder] Executing:", { order_id });

      // Parse order ID
      const parsed = parseOrderId(order_id);

      if (!parsed) {
        return {
          success: false,
          order_id,
          exchange: "polymarket",
          error:
            "Invalid order_id format. Expected 'kalshi:{id}' or 'polymarket:{id}'",
        };
      }

      const { exchange, orderId } = parsed;

      // Kalshi doesn't support cancellation
      if (exchange === "kalshi") {
        return {
          success: false,
          order_id,
          exchange: "kalshi",
          error:
            "Kalshi does not support order cancellation. Orders are executed immediately.",
        };
      }

      // Cancel Polymarket order
      if (!polymarketWallet) {
        return {
          success: false,
          order_id,
          exchange: "polymarket",
          error: "No Polymarket wallet available. Cannot cancel orders.",
        };
      }

      try {
        const client = await createClobClient(polymarketWallet);
        const result = await cancelPolymarketOrder(client, orderId);

        if (!result.success) {
          return {
            success: false,
            order_id,
            exchange: "polymarket",
            error: result.error,
          };
        }

        console.log("[cancelOrder] Success:", { order_id });

        return {
          success: true,
          order_id,
          exchange: "polymarket",
        };
      } catch (error) {
        console.error("[cancelOrder] Error:", error);
        return {
          success: false,
          order_id,
          exchange: "polymarket",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

// ============================================================================
// Export
// ============================================================================

export const cancelOrderTool = createCancelOrderTool;
