import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getTradeHistory Tool - Get trade history
// ============================================================================

export const getTradeHistoryTool = tool({
  description: "Get history of past trades.",
  inputSchema: z.object({
    wallet: z
      .string()
      .optional()
      .describe("Wallet address to get trades for"),
    market_ticker: z
      .string()
      .optional()
      .describe("Filter to specific market"),
    limit: z
      .number()
      .optional()
      .default(50)
      .describe("Max trades to return"),
  }),
  execute: async ({ wallet, market_ticker, limit }) => {
    console.log("[getTradeHistory] execute() called with:", {
      wallet,
      market_ticker,
      limit,
    });

    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit || 50));
      if (wallet) params.set("wallet", wallet);
      if (market_ticker) params.set("ticker", market_ticker);

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(`${baseUrl}/api/dflow/trades?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[getTradeHistory] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to fetch trades: ${response.status}`,
        };
      }

      const data = await response.json();
      console.log(
        "[getTradeHistory] Fetched",
        Array.isArray(data) ? data.length : 0,
        "trades"
      );

      return {
        success: true,
        trades: data,
        count: Array.isArray(data) ? data.length : 0,
      };
    } catch (error) {
      console.log("[getTradeHistory] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
