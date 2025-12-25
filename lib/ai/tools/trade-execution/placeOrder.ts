import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// placeOrder Tool - Place a trading order
// ============================================================================

export const placeOrderTool = tool({
  description:
    "Place an order to buy or sell outcome tokens. Supports both increasing (buying) and reducing (selling) positions.",
  inputSchema: z.object({
    market_ticker: z
      .string()
      .describe("Market to trade"),
    side: z
      .enum(["yes", "no"])
      .describe("Which outcome to trade"),
    action: z
      .enum(["buy", "sell"])
      .describe("Buy to increase position, sell to reduce"),
    quantity: z
      .number()
      .positive()
      .describe("Number of outcome tokens"),
    limit_price: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Max price for buy, min for sell. Range 0-1."),
    slippage_tolerance: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.02)
      .describe("Acceptable slippage (e.g., 0.02 = 2%)"),
    execution_mode: z
      .enum(["sync", "async"])
      .optional()
      .default("sync")
      .describe("Sync returns immediately. Async returns order ID for polling."),
  }),
  execute: async ({
    market_ticker,
    side,
    action,
    quantity,
    limit_price,
    slippage_tolerance,
    execution_mode,
  }) => {
    console.log("[placeOrder] execute() called with:", {
      market_ticker,
      side,
      action,
      quantity,
      limit_price,
      slippage_tolerance,
      execution_mode,
    });

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(`${baseUrl}/api/dflow/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          market_ticker,
          side,
          action,
          quantity,
          limit_price,
          slippage_tolerance,
          execution_mode,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[placeOrder] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to place order: ${response.status} - ${errorText}`,
          market_ticker,
          side,
          action,
        };
      }

      const data = await response.json();
      console.log("[placeOrder] Order placed:", data);

      return {
        success: true,
        order: data,
        market_ticker,
        side,
        action,
        quantity,
      };
    } catch (error) {
      console.log("[placeOrder] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        market_ticker,
        side,
        action,
      };
    }
  },
});
