// ============================================================================
// AI Tools - Prediction Market Trading Tools
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type KeyPairSigner } from "@solana/kit";

// Market Discovery - Event-centric discovery (NEW)
export { discoverEventTool, createDiscoverEventTool } from "./discoverEvent";

// Position Management - Trade and manage positions (NEW dflow-based tools)
import {
  createIncreasePositionTool,
  increasePositionTool,
} from "./increasePosition";
import {
  createDecreasePositionTool,
  decreasePositionTool,
} from "./decreasePosition";
import {
  createRetrievePositionTool,
  retrievePositionTool,
} from "./retrievePosition";
import { createRedeemPositionTool, redeemPositionTool } from "./redeemPosition";

export {
  createIncreasePositionTool,
  increasePositionTool,
  createDecreasePositionTool,
  decreasePositionTool,
  createRetrievePositionTool,
  retrievePositionTool,
  createRedeemPositionTool,
  redeemPositionTool,
};

// Utilities
export {
  resolveMints,
  getTradeMintsForBuy,
  getTradeMintsForSell,
  getOutcomeMint,
  clearMarketCache,
} from "./utils/resolveMints";

// ============================================================================
// Tool Factory - Create tools with wallet context injected
// ============================================================================

/**
 * Create tools with wallet context injected.
 * Each agent instance gets tools bound to its wallet.
 *
 * @param walletAddress - Public wallet address for queries
 * @param signer - KeyPairSigner for signing transactions (optional)
 */
export async function createAgentTools(
  walletAddress: string,
  signer?: KeyPairSigner,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Market discovery - use the new discoverEvent tool (read-only, no wallet needed)
  const { discoverEventTool } = await import("./discoverEvent");

  // Portfolio tools (bound to wallet address)
  const getBalance = tool({
    description: "Get your available cash balance for trading.",
    inputSchema: z.object({
      currency: z
        .enum(["USDC", "CASH"])
        .optional()
        .default("USDC")
        .describe("Settlement currency to check"),
    }),
    execute: async ({ currency }) => {
      try {
        const params = new URLSearchParams();
        params.set("wallet", walletAddress);
        params.set("currency", currency || "USDC");

        const response = await fetch(`${baseUrl}/api/solana/balance?${params}`);
        if (!response.ok) {
          return {
            success: false,
            error: `Failed to fetch balance: ${response.status}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          wallet: data.wallet,
          currency: data.currency,
          balance: data.balance,
          formatted: data.formatted,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  const getTradeHistory = tool({
    description: "Get your recent trade history.",
    inputSchema: z.object({
      limit: z.number().optional().default(20).describe("Max trades to return"),
    }),
    execute: async ({ limit }) => {
      try {
        const params = new URLSearchParams();
        params.set("wallet", walletAddress);
        params.set("limit", String(limit || 20));

        const response = await fetch(`${baseUrl}/api/dflow/trades?${params}`);
        if (!response.ok) {
          return {
            success: false,
            error: `Failed to fetch trades: ${response.status}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          trades: data.trades || [],
          count: data.trades?.length || 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  // Position management tools (NEW - using dflow directly)
  const increasePosition = createIncreasePositionTool(walletAddress, signer);
  const decreasePosition = createDecreasePositionTool(walletAddress, signer);
  const retrievePosition = createRetrievePositionTool(walletAddress);
  const redeemPosition = createRedeemPositionTool(walletAddress, signer);

  return {
    // Market discovery (read-only) - NEW event-centric tool
    discoverEvent: discoverEventTool,

    // Portfolio (wallet-bound)
    getBalance,
    getTradeHistory,

    // Position management (dflow-based)
    increasePosition,
    decreasePosition,
    retrievePosition,
    redeemPosition,
  };
}

/**
 * Type for agent tools
 */
export type AgentTools = ReturnType<typeof createAgentTools>;
