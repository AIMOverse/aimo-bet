import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getMarketDetails Tool - Get detailed market information
// ============================================================================

export const getMarketDetailsTool = tool({
  description:
    "Get detailed information about a specific market including current prices and liquidity.",
  inputSchema: z.object({
    ticker: z
      .string()
      .describe("Market ticker (e.g., 'BTCD-25DEC0313-T92749.99')"),
  }),
  execute: async ({ ticker }) => {
    console.log("[getMarketDetails] execute() called with ticker:", ticker);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(
        `${baseUrl}/api/dflow/markets/${encodeURIComponent(ticker)}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[getMarketDetails] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to fetch market details: ${response.status}`,
          ticker,
        };
      }

      const data = await response.json();
      console.log("[getMarketDetails] Fetched details for:", ticker);

      return {
        success: true,
        market: data,
        ticker,
      };
    } catch (error) {
      console.log("[getMarketDetails] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        ticker,
      };
    }
  },
});
