// ============================================================================
// Place Limit Order Tool
// Limit order execution on Polymarket
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type Wallet } from "ethers";

// Polymarket imports
import { createClobClient } from "@/lib/prediction-market/polymarket/clob";
import { executeLimitOrder } from "@/lib/prediction-market/polymarket/trade";

import type { PlaceOrderResult, OrderSide, TimeInForce } from "./types";

// ============================================================================
// Polymarket Limit Order Execution
// ============================================================================

async function executePolymarketLimitOrder(params: {
  tokenId: string;
  side: OrderSide;
  quantity: number;
  price: number;
  timeInForce: TimeInForce;
  wallet: Wallet;
}): Promise<PlaceOrderResult> {
  const { tokenId, side, quantity, price, timeInForce, wallet } = params;
  const logPrefix = "[placeLimitOrder:polymarket]";

  try {
    // Create CLOB client
    const client = await createClobClient(wallet);

    console.log(`${logPrefix} Executing:`, {
      tokenId: tokenId.slice(0, 16) + "...",
      side,
      quantity,
      price,
      timeInForce,
    });

    // Map time in force (IOC maps to FAK in Polymarket)
    const clobTimeInForce =
      timeInForce === "FOK" ? "FOK" : timeInForce === "IOC" ? "FAK" : "GTC";

    const result = await executeLimitOrder(client, {
      tokenId,
      side: side === "buy" ? "BUY" : "SELL",
      size: quantity,
      price,
      orderType: clobTimeInForce,
    });

    if (!result.success) {
      return {
        success: false,
        order_id: result.orderId ? `polymarket:${result.orderId}` : "",
        exchange: "polymarket",
        status: "failed",
        filled_quantity: 0,
        avg_price: 0,
        total_cost: 0,
        error: result.error,
      };
    }

    console.log(`${logPrefix} Success:`, {
      orderId: result.orderId,
      status: result.status,
      filledSize: result.filledSize,
      avgPrice: result.avgPrice,
    });

    return {
      success: true,
      order_id: `polymarket:${result.orderId}`,
      exchange: "polymarket",
      status: result.status === "MATCHED" ? "filled" : "open",
      filled_quantity: result.filledSize,
      avg_price: result.avgPrice,
      total_cost: result.filledSize * result.avgPrice,
    };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      success: false,
      order_id: "",
      exchange: "polymarket",
      status: "failed",
      filled_quantity: 0,
      avg_price: 0,
      total_cost: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create placeLimitOrder tool bound to Polymarket wallet
 *
 * Limit orders are placed at a specific price and may not execute immediately.
 * Only supported on Polymarket (Kalshi uses immediate market execution).
 *
 * The returned order_id can be used with cancelLimitOrder if the order
 * has not yet been filled.
 *
 * @param polymarketWallet - ethers Wallet for Polymarket trades (optional)
 */
export function createPlaceLimitOrderTool(polymarketWallet?: Wallet) {
  return tool({
    description:
      "Place a limit order on Polymarket at a specific price. " +
      "Limit orders may not execute immediately - they wait until the market reaches your price. " +
      "Only supported on Polymarket (use placeMarketOrder for Kalshi). " +
      "Use explainMarket first to get the token_id. " +
      "The returned order_id can be used with cancelLimitOrder if the order hasn't filled.",
    inputSchema: z.object({
      id: z.string().describe("Polymarket token_id for the outcome"),
      side: z.enum(["buy", "sell"]).describe("Trade direction"),
      outcome: z.enum(["yes", "no"]).describe("Outcome to trade"),
      quantity: z
        .number()
        .min(1)
        .describe("Number of outcome tokens to trade (must be >= 1)"),
      price: z
        .number()
        .min(0.01)
        .max(0.99)
        .describe("Limit price per token (0.01-0.99)"),
      time_in_force: z
        .enum(["GTC", "FOK", "IOC"])
        .optional()
        .default("GTC")
        .describe(
          "Time in force: GTC (Good Till Cancelled, default), FOK (Fill Or Kill), IOC (Immediate Or Cancel)",
        ),
    }),
    execute: async ({
      id,
      side,
      outcome,
      quantity,
      price,
      time_in_force = "GTC",
    }): Promise<PlaceOrderResult> => {
      console.log("[placeLimitOrder] Executing:", {
        id,
        side,
        outcome,
        quantity,
        price,
        time_in_force,
      });

      if (!polymarketWallet) {
        return {
          success: false,
          order_id: "",
          exchange: "polymarket",
          status: "failed",
          filled_quantity: 0,
          avg_price: 0,
          total_cost: 0,
          error: "No Polymarket wallet available. Cannot execute trades.",
        };
      }

      return executePolymarketLimitOrder({
        tokenId: id,
        side,
        quantity,
        price,
        timeInForce: time_in_force,
        wallet: polymarketWallet,
      });
    },
  });
}

// ============================================================================
// Export
// ============================================================================

export const placeLimitOrderTool = createPlaceLimitOrderTool;
