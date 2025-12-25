// ============================================================================
// AI Tools - Prediction Market Trading Tools
// ============================================================================

import { tool } from "ai";
import { z } from "zod";

// Market Discovery - Find and analyze prediction markets
export {
  getMarketsTool,
  getMarketDetailsTool,
  getLiveDataTool,
} from "./market-discovery";

// Trade Execution - Place and manage orders
export {
  placeOrderTool,
  getOrderStatusTool,
  cancelOrderTool,
} from "./trade-execution";

// Portfolio Management - Track positions, balance, and history
export {
  getPositionsTool,
  getBalanceTool,
  getTradeHistoryTool,
} from "./portfolio-management";

// ============================================================================
// Tool Factory - Create tools with wallet context injected
// ============================================================================

/**
 * Create tools with wallet context injected.
 * Each agent instance gets tools bound to its wallet.
 *
 * @param walletAddress - Public wallet address for queries
 * @param walletPrivateKey - Private key for signing transactions (optional)
 */
export function createAgentTools(
  walletAddress: string,
  walletPrivateKey?: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Market discovery tools (read-only, no wallet needed)
  const getMarkets = tool({
    description:
      "Get list of prediction markets. Use to discover trading opportunities.",
    inputSchema: z.object({
      status: z
        .enum(["active", "inactive", "closed", "determined", "finalized"])
        .optional()
        .default("active")
        .describe("Filter by market status. Default: active"),
      category: z
        .string()
        .optional()
        .describe("Filter by category (e.g., 'crypto', 'sports')"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Max markets to return"),
    }),
    execute: async ({ status, category, limit }) => {
      try {
        const params = new URLSearchParams();
        params.set("status", status || "active");
        if (category) params.set("category", category);
        params.set("limit", String(limit || 20));

        const response = await fetch(`${baseUrl}/api/dflow/markets?${params}`);
        if (!response.ok) {
          return { success: false, error: `Failed to fetch markets: ${response.status}` };
        }

        const data = await response.json();
        return {
          success: true,
          markets: data,
          count: Array.isArray(data) ? data.length : 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  const getMarketDetails = tool({
    description:
      "Get detailed information about a specific prediction market.",
    inputSchema: z.object({
      ticker: z.string().describe("Market ticker to get details for"),
    }),
    execute: async ({ ticker }) => {
      try {
        const response = await fetch(`${baseUrl}/api/dflow/markets/${ticker}`);
        if (!response.ok) {
          return { success: false, error: `Failed to fetch market: ${response.status}` };
        }

        const data = await response.json();
        return { success: true, market: data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  const getLiveData = tool({
    description:
      "Get live price and orderbook data for a market.",
    inputSchema: z.object({
      ticker: z.string().describe("Market ticker to get live data for"),
    }),
    execute: async ({ ticker }) => {
      try {
        const response = await fetch(`${baseUrl}/api/dflow/markets/${ticker}/live`);
        if (!response.ok) {
          return { success: false, error: `Failed to fetch live data: ${response.status}` };
        }

        const data = await response.json();
        return { success: true, liveData: data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

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
          return { success: false, error: `Failed to fetch balance: ${response.status}` };
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

  const getPositions = tool({
    description:
      "Get your current positions (outcome token holdings) across all prediction markets.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        // Use the positions API endpoint directly
        const response = await fetch(`${baseUrl}/api/dflow/positions?wallet=${walletAddress}`);
        if (!response.ok) {
          // Fallback: the positions endpoint might not exist, return empty
          return {
            success: true,
            wallet: walletAddress,
            positions: [],
            count: 0,
          };
        }

        const data = await response.json();
        return {
          success: true,
          wallet: walletAddress,
          positions: data.positions || [],
          count: data.positions?.length || 0,
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
          return { success: false, error: `Failed to fetch trades: ${response.status}` };
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

  // Trade execution tools (bound to wallet for signing)
  const placeOrder = tool({
    description:
      "Place an order to buy or sell outcome tokens. Supports both increasing (buying) and reducing (selling) positions.",
    inputSchema: z.object({
      market_ticker: z.string().describe("Market to trade"),
      side: z.enum(["yes", "no"]).describe("Which outcome to trade"),
      action: z.enum(["buy", "sell"]).describe("Buy to increase position, sell to reduce"),
      quantity: z.number().positive().describe("Number of outcome tokens"),
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
    }),
    execute: async ({
      market_ticker,
      side,
      action,
      quantity,
      limit_price,
      slippage_tolerance,
    }) => {
      console.log("[placeOrder] Executing trade:", {
        wallet: walletAddress,
        market_ticker,
        side,
        action,
        quantity,
        limit_price,
        slippage_tolerance,
      });

      try {
        const response = await fetch(`${baseUrl}/api/dflow/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: walletAddress,
            wallet_private_key: walletPrivateKey,
            market_ticker,
            side,
            action,
            quantity,
            limit_price,
            slippage_tolerance,
            execution_mode: "sync",
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: `Failed to place order: ${response.status} - ${errorText}`,
            market_ticker,
            side,
            action,
          };
        }

        const data = await response.json();
        return {
          success: true,
          order: data,
          market_ticker,
          side,
          action,
          quantity,
        };
      } catch (error) {
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

  const getOrderStatus = tool({
    description: "Check the status of an order.",
    inputSchema: z.object({
      order_id: z.string().describe("Order ID to check"),
    }),
    execute: async ({ order_id }) => {
      try {
        const response = await fetch(`${baseUrl}/api/dflow/order/${order_id}`);
        if (!response.ok) {
          return { success: false, error: `Failed to get order status: ${response.status}` };
        }

        const data = await response.json();
        return { success: true, order: data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  const cancelOrder = tool({
    description: "Cancel a pending order.",
    inputSchema: z.object({
      order_id: z.string().describe("Order ID to cancel"),
    }),
    execute: async ({ order_id }) => {
      try {
        const response = await fetch(`${baseUrl}/api/dflow/order/${order_id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: walletAddress,
            wallet_private_key: walletPrivateKey,
          }),
        });

        if (!response.ok) {
          return { success: false, error: `Failed to cancel order: ${response.status}` };
        }

        const data = await response.json();
        return { success: true, result: data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  return {
    // Market discovery (read-only)
    getMarkets,
    getMarketDetails,
    getLiveData,
    // Portfolio (wallet-bound)
    getBalance,
    getPositions,
    getTradeHistory,
    // Trade execution (wallet-bound with signing)
    placeOrder,
    getOrderStatus,
    cancelOrder,
  };
}

/**
 * Type for agent tools
 */
export type AgentTools = ReturnType<typeof createAgentTools>;
