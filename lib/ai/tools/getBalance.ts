// ============================================================================
// Get Balance Tool
// Get USDC balance for agent's wallet via tool result (cache-friendly)
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { getCurrencyBalance } from "@/lib/solana/client";
import type { SupportedCurrency } from "@/lib/solana/client";

// ============================================================================
// Types
// ============================================================================

interface GetBalanceResult {
  success: boolean;
  wallet: string;
  balance: number;
  currency: string;
  timestamp: string;
  error?: string;
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create getBalance tool bound to a wallet address
 * Returns wallet's USDC balance as tool result (cache-friendly append)
 */
export function createGetBalanceTool(walletAddress: string) {
  return tool({
    description:
      "Get your available USDC balance for trading. Use this to check how much you can spend on trades.",
    inputSchema: z.object({
      currency: z
        .enum(["USDC", "CASH"])
        .default("USDC" as const)
        .describe("Currency to check balance for (default: USDC)"),
    }),
    execute: async ({ currency = "USDC" as SupportedCurrency }): Promise<GetBalanceResult> => {
      console.log("[getBalance] Fetching balance for:", walletAddress);

      try {
        const balanceResult = await getCurrencyBalance(walletAddress, currency);

        if (balanceResult === null) {
          console.log("[getBalance] No balance found for:", currency);
          return {
            success: true,
            wallet: walletAddress,
            balance: 0,
            currency,
            timestamp: new Date().toISOString(),
          };
        }

        const balance = Number(balanceResult.formatted);
        console.log("[getBalance] Balance:", balance, currency);

        return {
          success: true,
          wallet: walletAddress,
          balance,
          currency,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error("[getBalance] Error:", error);

        return {
          success: false,
          wallet: walletAddress,
          balance: 0,
          currency,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

// ============================================================================
// Export standalone tool for direct import
// ============================================================================

export const getBalanceTool = createGetBalanceTool;
