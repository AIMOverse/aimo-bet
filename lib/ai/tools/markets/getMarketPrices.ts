import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getMarketPrices Tool - Get current bid/ask prices
// ============================================================================

export const getMarketPricesTool = tool({
  description:
    "Get current bid/ask prices for one or more markets. Uses real-time data.",
  inputSchema: z.object({
    tickers: z
      .array(z.string())
      .optional()
      .describe("Market tickers to get prices for. If empty, returns all available."),
  }),
  execute: async ({ tickers }) => {
    console.log("[getMarketPrices] execute() called with tickers:", tickers);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const url = tickers?.length
        ? `${baseUrl}/api/dflow/prices?tickers=${tickers.join(",")}`
        : `${baseUrl}/api/dflow/prices`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[getMarketPrices] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to fetch prices: ${response.status}`,
        };
      }

      const data = await response.json();
      console.log(
        "[getMarketPrices] Fetched",
        Array.isArray(data) ? data.length : 1,
        "price entries"
      );

      return {
        success: true,
        prices: data,
        count: Array.isArray(data) ? data.length : 1,
      };
    } catch (error) {
      console.log("[getMarketPrices] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
