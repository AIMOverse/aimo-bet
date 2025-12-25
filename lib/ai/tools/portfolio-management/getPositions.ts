import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getPositions Tool - Get current positions
// ============================================================================

export const getPositionsTool = tool({
  description:
    "Get current positions (outcome token holdings) across all markets.",
  inputSchema: z.object({
    wallet: z
      .string()
      .describe("Wallet address to get positions for"),
    market_tickers: z
      .array(z.string())
      .optional()
      .describe("Filter to specific markets"),
    include_closed: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include positions in closed/determined markets"),
  }),
  execute: async ({ wallet, market_tickers, include_closed }) => {
    console.log("[getPositions] execute() called with:", {
      wallet,
      market_tickers,
      include_closed,
    });

    try {
      const params = new URLSearchParams();
      params.set("wallet", wallet);
      if (market_tickers?.length) params.set("tickers", market_tickers.join(","));
      if (include_closed) params.set("include_closed", "true");

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(`${baseUrl}/api/dflow/positions?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[getPositions] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to fetch positions: ${response.status}`,
          wallet,
        };
      }

      const data = await response.json();
      console.log("[getPositions] Fetched positions for wallet:", wallet);

      return {
        success: true,
        wallet: data.wallet,
        positions: data.positions,
        count: Array.isArray(data.positions) ? data.positions.length : 0,
      };
    } catch (error) {
      console.log("[getPositions] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        wallet,
      };
    }
  },
});
