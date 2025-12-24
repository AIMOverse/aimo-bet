import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getBalance Tool - Get wallet balance
// ============================================================================

export const getBalanceTool = tool({
  description: "Get available cash balance for trading.",
  inputSchema: z.object({
    wallet: z
      .string()
      .describe("Wallet address to get balance for"),
    currency: z
      .enum(["USDC", "CASH"])
      .optional()
      .default("USDC")
      .describe("Settlement currency to check"),
  }),
  execute: async ({ wallet, currency }) => {
    console.log("[getBalance] execute() called with:", { wallet, currency });

    try {
      const params = new URLSearchParams();
      params.set("wallet", wallet);
      params.set("currency", currency || "USDC");

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(`${baseUrl}/api/dflow/balance?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[getBalance] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to fetch balance: ${response.status}`,
          wallet,
          currency,
        };
      }

      const data = await response.json();
      console.log("[getBalance] Balance:", data);

      return {
        success: true,
        wallet: data.wallet,
        currency: data.currency,
        balance: data.balance,
        formatted: data.formatted,
      };
    } catch (error) {
      console.log("[getBalance] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        wallet,
        currency,
      };
    }
  },
});
