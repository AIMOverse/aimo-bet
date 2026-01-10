// ============================================================================
// Get Balance Tool
// Multi-exchange USDC balance across Kalshi (Solana) and Polymarket (Polygon)
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { getCurrencyBalance } from "@/lib/crypto/solana/client";
import { getUsdcBalance } from "@/lib/crypto/polygon/client";
import type { ToolSigners, GetBalanceResult, ChainBalance } from "./types";

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create getBalance tool bound to multi-chain signers
 * Returns USDC balance from both Kalshi (Solana) and Polymarket (Polygon)
 */
export function createGetBalanceTool(signers: ToolSigners) {
  return tool({
    description:
      "Get your available USDC balance for trading across exchanges. Returns balances for Kalshi (Solana) and Polymarket (Polygon).",
    inputSchema: z.object({
      exchange: z
        .enum(["kalshi", "polymarket", "all"])
        .default("all")
        .describe("Which exchange to check balance for (default: all)"),
    }),
    execute: async ({ exchange = "all" }): Promise<GetBalanceResult> => {
      const logPrefix = "[management/getBalance]";
      console.log(`${logPrefix} Fetching balance for exchange: ${exchange}`);

      const timestamp = new Date().toISOString();
      const balances: GetBalanceResult["balances"] = {};
      let totalBalance = 0;

      try {
        // Fetch Kalshi (Solana) balance
        if (exchange === "all" || exchange === "kalshi") {
          const kalshiResult = await fetchKalshiBalance(signers.svm.address);
          if (kalshiResult) {
            balances.kalshi = kalshiResult;
            totalBalance += kalshiResult.balance;
            console.log(`${logPrefix} Kalshi balance: $${kalshiResult.balance}`);
          } else {
            throw new Error("Failed to fetch Kalshi balance");
          }
        }

        // Fetch Polymarket (Polygon) balance
        if (exchange === "all" || exchange === "polymarket") {
          const polymarketResult = await fetchPolymarketBalance(signers.evm.address);
          if (polymarketResult) {
            balances.polymarket = polymarketResult;
            totalBalance += polymarketResult.balance;
            console.log(`${logPrefix} Polymarket balance: $${polymarketResult.balance}`);
          } else {
            throw new Error("Failed to fetch Polymarket balance");
          }
        }

        console.log(`${logPrefix} Total balance: $${totalBalance}`);

        return {
          success: true,
          balances,
          total_balance: totalBalance,
          timestamp,
        };
      } catch (error) {
        console.error(`${logPrefix} Error:`, error);
        return {
          success: false,
          balances,
          total_balance: totalBalance,
          timestamp,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

// ============================================================================
// Balance Fetchers
// ============================================================================

async function fetchKalshiBalance(address: string): Promise<ChainBalance | null> {
  const result = await getCurrencyBalance(address, "USDC");
  if (result === null) {
    return {
      chain: "solana",
      wallet: address,
      balance: 0,
      currency: "USDC",
    };
  }

  return {
    chain: "solana",
    wallet: result.wallet,
    balance: Number(result.formatted),
    currency: "USDC",
  };
}

async function fetchPolymarketBalance(address: string): Promise<ChainBalance | null> {
  const result = await getUsdcBalance(address);
  if (result === null) {
    return {
      chain: "polygon",
      wallet: address,
      balance: 0,
      currency: "USDC.e",
    };
  }

  return {
    chain: "polygon",
    wallet: result.address,
    balance: result.balance,
    currency: "USDC.e",
  };
}

// ============================================================================
// Export standalone tool for direct import
// ============================================================================

export const getBalanceTool = createGetBalanceTool;
