// ============================================================================
// Cancel Limit Order Tool
// Cancel open limit orders on Polymarket
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type PolygonWallet } from "@/lib/crypto/polygon/client";

import { createClobClient } from "@/lib/prediction-market/polymarket/clob";
import { cancelOrder } from "@/lib/prediction-market/polymarket/trade";

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
  prefixedOrderId: string
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
 * Create cancelLimitOrder tool bound to Polymarket wallet
 *
 * Only Polymarket limit orders can be cancelled. Kalshi orders execute
 * immediately and cannot be cancelled.
 *
 * @param polymarketWallet - Polygon wallet for Polymarket trades (optional)
 */
export function createCancelLimitOrderTool(polymarketWallet?: PolygonWallet) {
  return tool({
    description:
      "Cancel an open limit order on Polymarket. " +
      "Only unfilled or partially filled limit orders can be cancelled. " +
      "Kalshi orders execute immediately and cannot be cancelled. " +
      "Use the order_id returned from placeLimitOrder.",
    inputSchema: z.object({
      order_id: z
        .string()
        .describe(
          "Prefixed order ID from placeLimitOrder (e.g., 'polymarket:abc123')"
        ),
    }),
    execute: async ({ order_id }): Promise<CancelOrderResult> => {
      const logPrefix = "[cancelLimitOrder]";
      console.log(`${logPrefix} Executing:`, { order_id });

      // Parse order ID
      const parsed = parseOrderId(order_id);

      if (!parsed) {
        return {
          success: false,
          order_id,
          exchange: "polymarket",
          error:
            "Invalid order_id format. Expected 'polymarket:{id}' (e.g., 'polymarket:abc123')",
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
            "Kalshi orders execute immediately as market orders and cannot be cancelled. " +
            "Only Polymarket limit orders support cancellation.",
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
        const result = await cancelOrder(client, orderId);

        if (!result.success) {
          return {
            success: false,
            order_id,
            exchange: "polymarket",
            error: result.error,
          };
        }

        console.log(`${logPrefix} Success:`, { order_id });

        return {
          success: true,
          order_id,
          exchange: "polymarket",
        };
      } catch (error) {
        console.error(`${logPrefix} Error:`, error);
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

export const cancelLimitOrderTool = createCancelLimitOrderTool;
