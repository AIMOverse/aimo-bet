// ============================================================================
// Place Order Tool
// Unified order placement across Kalshi and Polymarket exchanges
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type KeyPairSigner } from "@solana/kit";
import { type Wallet } from "ethers";

// Kalshi imports
import {
  executeTrade,
  type TradeResult as KalshiTradeResult,
} from "@/lib/prediction-market/kalshi/dflow/trade/trade";
import {
  resolveMints,
  getTradeMintsForBuy,
  getTradeMintsForSell,
} from "@/lib/prediction-market/kalshi/dflow/resolveMints";

// Polymarket imports
import { createClobClient } from "@/lib/prediction-market/polymarket/clob";
import {
  executeMarketOrder,
  executeLimitOrder,
} from "@/lib/prediction-market/polymarket/trade";

import type { PlaceOrderResult, Exchange, Outcome, OrderSide } from "./types";

// ============================================================================
// Constants
// ============================================================================

const USDC_DECIMALS = 6;
const OUTCOME_DECIMALS = 6;
const DEFAULT_SLIPPAGE_BPS = 200;

// ============================================================================
// Kalshi Trade Execution
// ============================================================================

async function placeKalshiOrder(params: {
  marketTicker: string;
  side: OrderSide;
  outcome: Outcome;
  quantity: number;
  slippageBps: number;
  walletAddress: string;
  signer: KeyPairSigner;
}): Promise<PlaceOrderResult> {
  const {
    marketTicker,
    side,
    outcome,
    quantity,
    slippageBps,
    walletAddress,
    signer,
  } = params;
  const logPrefix = "[placeOrder:kalshi]";

  try {
    // Resolve market to mints
    const resolved = await resolveMints(marketTicker);

    if (resolved.status !== "active") {
      return {
        success: false,
        order_id: "",
        exchange: "kalshi",
        status: "failed",
        filled_quantity: 0,
        avg_price: 0,
        total_cost: 0,
        error: `Market is not active. Status: ${resolved.status}`,
      };
    }

    // Get trade direction mints
    const { inputMint, outputMint } =
      side === "buy"
        ? getTradeMintsForBuy(resolved, outcome)
        : getTradeMintsForSell(resolved, outcome);

    // Calculate amount based on direction
    // For BUY: amount is USDC to spend (estimated from quantity * price)
    // For SELL: amount is tokens to sell
    let tradeAmount: number;

    if (side === "buy") {
      // Buying: need to estimate USDC amount from quantity
      // Assume ~0.5 price as starting estimate (market will fill at actual price)
      const estimatedPrice = 0.5;
      const estimatedUsdc = quantity * estimatedPrice;
      tradeAmount = Math.floor(estimatedUsdc * Math.pow(10, USDC_DECIMALS));
    } else {
      // Selling: amount is the tokens to sell
      tradeAmount = Math.floor(quantity * Math.pow(10, OUTCOME_DECIMALS));
    }

    console.log(`${logPrefix} Executing:`, {
      marketTicker,
      side,
      outcome,
      quantity,
      tradeAmount,
    });

    // Execute trade
    const result: KalshiTradeResult = await executeTrade(
      {
        inputMint,
        outputMint,
        amount: tradeAmount,
        userPublicKey: walletAddress,
        slippageBps,
        predictionMarketSlippageBps: slippageBps,
      },
      signer,
    );

    if (!result.success) {
      return {
        success: false,
        order_id: `kalshi:${result.signature}`,
        exchange: "kalshi",
        status: "failed",
        filled_quantity: 0,
        avg_price: 0,
        total_cost: 0,
        error: result.error || "Trade execution failed",
      };
    }

    // Calculate results based on trade direction
    const inAmount = Number(result.inAmount) / Math.pow(10, USDC_DECIMALS);
    const outAmount = Number(result.outAmount) / Math.pow(10, OUTCOME_DECIMALS);

    // For BUY: filled_quantity = tokens received, total_cost = USDC spent
    // For SELL: filled_quantity = tokens sold, total_cost = USDC received
    const filledQuantity = side === "buy" ? outAmount : inAmount;
    const totalCost = side === "buy" ? inAmount : outAmount;
    const avgPrice = filledQuantity > 0 ? totalCost / filledQuantity : 0;

    console.log(`${logPrefix} Success:`, {
      signature: result.signature,
      filledQuantity,
      avgPrice,
      totalCost,
    });

    return {
      success: true,
      order_id: `kalshi:${result.signature}`,
      exchange: "kalshi",
      status: "filled",
      filled_quantity: filledQuantity,
      avg_price: avgPrice,
      total_cost: totalCost,
    };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      success: false,
      order_id: "",
      exchange: "kalshi",
      status: "failed",
      filled_quantity: 0,
      avg_price: 0,
      total_cost: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Polymarket Trade Execution
// ============================================================================

async function placePolymarketOrder(params: {
  tokenId: string;
  side: OrderSide;
  orderType: "market" | "limit";
  quantity: number;
  price?: number;
  timeInForce: "GTC" | "FOK" | "IOC";
  wallet: Wallet;
}): Promise<PlaceOrderResult> {
  const { tokenId, side, orderType, quantity, price, timeInForce, wallet } =
    params;
  const logPrefix = "[placeOrder:polymarket]";

  try {
    // Create CLOB client
    const client = await createClobClient(wallet);

    console.log(`${logPrefix} Executing:`, {
      tokenId: tokenId.slice(0, 16) + "...",
      side,
      orderType,
      quantity,
      price,
    });

    // Execute based on order type
    if (orderType === "market") {
      const result = await executeMarketOrder(client, {
        tokenId,
        side: side === "buy" ? "BUY" : "SELL",
        size: quantity,
      });

      if (!result.success) {
        return {
          success: false,
          order_id: result.orderId ? `polymarket:${result.orderId}` : "",
          exchange: "polymarket",
          status: "failed",
          filled_quantity: 0,
          avg_price: 0,
          total_cost: 0,
          error: result.error,
        };
      }

      return {
        success: true,
        order_id: `polymarket:${result.orderId}`,
        exchange: "polymarket",
        status: result.status === "MATCHED" ? "filled" : "partial",
        filled_quantity: result.filledSize,
        avg_price: result.avgPrice,
        total_cost: result.filledSize * result.avgPrice,
      };
    } else {
      // Limit order
      if (price === undefined) {
        return {
          success: false,
          order_id: "",
          exchange: "polymarket",
          status: "failed",
          filled_quantity: 0,
          avg_price: 0,
          total_cost: 0,
          error: "Price required for limit orders",
        };
      }

      // Map time in force (IOC maps to FAK in Polymarket)
      const clobTimeInForce =
        timeInForce === "FOK" ? "FOK" : timeInForce === "IOC" ? "FAK" : "GTC";

      const result = await executeLimitOrder(client, {
        tokenId,
        side: side === "buy" ? "BUY" : "SELL",
        size: quantity,
        price,
        orderType: clobTimeInForce,
      });

      if (!result.success) {
        return {
          success: false,
          order_id: result.orderId ? `polymarket:${result.orderId}` : "",
          exchange: "polymarket",
          status: "failed",
          filled_quantity: 0,
          avg_price: 0,
          total_cost: 0,
          error: result.error,
        };
      }

      return {
        success: true,
        order_id: `polymarket:${result.orderId}`,
        exchange: "polymarket",
        status: result.status === "MATCHED" ? "filled" : "open",
        filled_quantity: result.filledSize,
        avg_price: result.avgPrice,
        total_cost: result.filledSize * result.avgPrice,
      };
    }
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      success: false,
      order_id: "",
      exchange: "polymarket",
      status: "failed",
      filled_quantity: 0,
      avg_price: 0,
      total_cost: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create placeOrder tool bound to wallet signers
 *
 * @param kalshiWalletAddress - Solana wallet address for Kalshi
 * @param kalshiSigner - KeyPairSigner for Kalshi trades (optional)
 * @param polymarketWallet - ethers Wallet for Polymarket trades (optional)
 */
export function createPlaceOrderTool(
  kalshiWalletAddress: string,
  kalshiSigner?: KeyPairSigner,
  polymarketWallet?: Wallet,
) {
  return tool({
    description:
      "Place buy or sell orders on prediction markets. " +
      "Supports market orders on both Kalshi and Polymarket, limit orders on Polymarket only. " +
      "Use explainMarket first to get the correct id (market_ticker for Kalshi, token_id for Polymarket).",
    inputSchema: z.object({
      exchange: z.enum(["kalshi", "polymarket"]).describe("Target exchange"),
      id: z
        .string()
        .describe(
          "Market identifier: market_ticker (Kalshi) or token_id (Polymarket)",
        ),
      side: z.enum(["buy", "sell"]).describe("Trade direction"),
      outcome: z.enum(["yes", "no"]).describe("Outcome to trade"),
      order_type: z
        .enum(["market", "limit"])
        .describe("Order type. Limit orders only supported on Polymarket"),
      quantity: z
        .number()
        .positive()
        .describe("Number of outcome tokens to trade"),
      price: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Price per token (0-1). Required for limit orders"),
      slippage_bps: z
        .number()
        .min(0)
        .max(1000)
        .optional()
        .default(DEFAULT_SLIPPAGE_BPS)
        .describe(
          "Slippage tolerance in basis points for market orders (default: 200)",
        ),
      time_in_force: z
        .enum(["GTC", "FOK", "IOC"])
        .optional()
        .default("GTC")
        .describe("Time in force for limit orders (default: GTC)"),
    }),
    execute: async ({
      exchange,
      id,
      side,
      outcome,
      order_type,
      quantity,
      price,
      slippage_bps = DEFAULT_SLIPPAGE_BPS,
      time_in_force = "GTC",
    }): Promise<PlaceOrderResult> => {
      console.log("[placeOrder] Executing:", {
        exchange,
        id,
        side,
        outcome,
        order_type,
        quantity,
        price,
      });

      // Validate exchange-specific constraints
      if (exchange === "kalshi" && order_type === "limit") {
        return {
          success: false,
          order_id: "",
          exchange: "kalshi",
          status: "failed",
          filled_quantity: 0,
          avg_price: 0,
          total_cost: 0,
          error: "Kalshi only supports market orders. Use order_type: 'market'",
        };
      }

      if (order_type === "limit" && price === undefined) {
        return {
          success: false,
          order_id: "",
          exchange,
          status: "failed",
          filled_quantity: 0,
          avg_price: 0,
          total_cost: 0,
          error: "Price is required for limit orders",
        };
      }

      // Route to exchange-specific handler
      if (exchange === "kalshi") {
        if (!kalshiSigner) {
          return {
            success: false,
            order_id: "",
            exchange: "kalshi",
            status: "failed",
            filled_quantity: 0,
            avg_price: 0,
            total_cost: 0,
            error: "No Kalshi signer available. Cannot execute trades.",
          };
        }

        return placeKalshiOrder({
          marketTicker: id,
          side,
          outcome,
          quantity,
          slippageBps: slippage_bps,
          walletAddress: kalshiWalletAddress,
          signer: kalshiSigner,
        });
      } else {
        // Polymarket
        if (!polymarketWallet) {
          return {
            success: false,
            order_id: "",
            exchange: "polymarket",
            status: "failed",
            filled_quantity: 0,
            avg_price: 0,
            total_cost: 0,
            error: "No Polymarket wallet available. Cannot execute trades.",
          };
        }

        return placePolymarketOrder({
          tokenId: id,
          side,
          orderType: order_type,
          quantity,
          price,
          timeInForce: time_in_force,
          wallet: polymarketWallet,
        });
      }
    },
  });
}

// ============================================================================
// Export
// ============================================================================

export const placeOrderTool = createPlaceOrderTool;
