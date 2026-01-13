// ============================================================================
// Place Market Order Tool
// Market order execution across Kalshi and Polymarket exchanges
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type KeyPairSigner } from "@solana/kit";
import { type PolygonWallet } from "@/lib/crypto/polygon/client";

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
import { createTradingClient } from "@/lib/prediction-market/polymarket/clob";
import { executeMarketOrder } from "@/lib/prediction-market/polymarket/trade";

import type { PlaceOrderResult, Outcome, OrderSide } from "./types";

// ============================================================================
// Constants
// ============================================================================

const USDC_DECIMALS = 6;
const OUTCOME_DECIMALS = 6;
const DEFAULT_SLIPPAGE_BPS = 200;

// ============================================================================
// Kalshi Market Order Execution
// ============================================================================

async function executeKalshiMarketOrder(params: {
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
  const logPrefix = "[placeMarketOrder:kalshi]";

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
      signer
    );

    if (!result.success) {
      return {
        success: false,
        order_id: result.signature ? `kalshi:${result.signature}` : "",
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
// Polymarket Market Order Execution
// ============================================================================

async function executePolymarketMarketOrder(params: {
  tokenId: string;
  side: OrderSide;
  quantity: number;
  wallet: PolygonWallet;
}): Promise<PlaceOrderResult> {
  const { tokenId, side, quantity, wallet } = params;
  const logPrefix = "[placeMarketOrder:polymarket]";

  // Validate tokenId - must be a valid Polymarket CLOB token ID
  // These are large numeric strings (77 digits), not market IDs or condition IDs
  if (!tokenId || tokenId.length < 50) {
    return {
      success: false,
      order_id: "",
      exchange: "polymarket",
      status: "failed",
      filled_quantity: 0,
      avg_price: 0,
      total_cost: 0,
      error: `Invalid token ID: "${
        tokenId || "undefined"
      }". Use explainMarket first to get the yes_token_id or no_token_id.`,
    };
  }

  try {
    // Create trading client with auto-allowance
    // This ensures USDC + CTF are approved for Polymarket contracts before trading
    const { client, allowanceApproved } = await createTradingClient(wallet);

    if (allowanceApproved) {
      console.log(`${logPrefix} Auto-approved allowances for trading`);
    }

    // For SELL orders, check orderbook liquidity first
    // FOK orders will fail if there's not enough liquidity
    let adjustedQuantity = quantity;

    if (side === "sell") {
      try {
        const orderbook = await client.getOrderBook(tokenId);
        const bids = orderbook?.bids || [];
        let availableLiquidity = 0;

        for (const bid of bids) {
          availableLiquidity += parseFloat(bid.size);
        }

        // Use 80% of available liquidity to account for slippage
        const maxSellable = availableLiquidity * 0.8;

        if (quantity > maxSellable) {
          console.log(
            `${logPrefix} Reducing sell size: ${quantity} → ${Math.floor(
              maxSellable
            )} (liquidity: ${availableLiquidity.toFixed(2)})`
          );
          adjustedQuantity = Math.floor(maxSellable);

          if (adjustedQuantity < 1) {
            return {
              success: false,
              order_id: "",
              exchange: "polymarket",
              status: "failed",
              filled_quantity: 0,
              avg_price: 0,
              total_cost: 0,
              error: `Insufficient liquidity. Only ${availableLiquidity.toFixed(
                2
              )} tokens available in orderbook.`,
            };
          }
        }
      } catch (orderbookError) {
        console.warn(
          `${logPrefix} Could not check orderbook, proceeding with original quantity`
        );
      }
    }

    // Round quantity to avoid precision issues with FOK orders
    // FOK requires exact amounts; decimals can cause "not enough balance"
    const roundedQuantity =
      side === "sell"
        ? Math.floor(adjustedQuantity) // Sell: round down to avoid over-selling
        : Math.ceil(adjustedQuantity); // Buy: round up for minimum purchase

    console.log(`${logPrefix} Executing:`, {
      tokenId: tokenId.slice(0, 16) + "...",
      side,
      originalQuantity: quantity,
      roundedQuantity,
    });

    const result = await executeMarketOrder(client, {
      tokenId,
      side: side === "buy" ? "BUY" : "SELL",
      size: roundedQuantity,
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

    console.log(`${logPrefix} Success:`, {
      orderId: result.orderId,
      filledSize: result.filledSize,
      avgPrice: result.avgPrice,
    });

    return {
      success: true,
      order_id: `polymarket:${result.orderId}`,
      exchange: "polymarket",
      status: result.status === "MATCHED" ? "filled" : "partial",
      filled_quantity: result.filledSize,
      avg_price: result.avgPrice,
      total_cost: result.filledSize * result.avgPrice,
    };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);

    // Provide helpful error message for common issues
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    let userError = errorMsg;

    if (errorMsg.includes("allowance") || errorMsg.includes("POL")) {
      userError = `${errorMsg}. Ensure the wallet has POL (MATIC) for gas fees.`;
    }

    return {
      success: false,
      order_id: "",
      exchange: "polymarket",
      status: "failed",
      filled_quantity: 0,
      avg_price: 0,
      total_cost: 0,
      error: userError,
    };
  }
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create placeMarketOrder tool bound to wallet signers
 *
 * Market orders execute immediately at the best available price.
 * Supported on both Kalshi and Polymarket.
 *
 * @param kalshiWalletAddress - Solana wallet address for Kalshi
 * @param kalshiSigner - KeyPairSigner for Kalshi trades (optional)
 * @param polymarketWallet - ethers Wallet for Polymarket trades (optional)
 */
export function createPlaceMarketOrderTool(
  kalshiWalletAddress: string,
  kalshiSigner?: KeyPairSigner,
  polymarketWallet?: PolygonWallet
) {
  return tool({
    description:
      "Place a market order on prediction markets. " +
      "Market orders execute immediately at the best available price. " +
      "Supported on both Kalshi and Polymarket. " +
      "Use explainMarket first to get the correct id (market_ticker for Kalshi, token_id for Polymarket). " +
      "Note: Market orders cannot be cancelled after execution.",
    inputSchema: z.object({
      exchange: z.enum(["kalshi", "polymarket"]).describe("Target exchange"),
      id: z
        .string()
        .describe(
          "Market identifier: market_ticker (Kalshi) or token_id (Polymarket)"
        ),
      side: z.enum(["buy", "sell"]).describe("Trade direction"),
      outcome: z.enum(["yes", "no"]).describe("Outcome to trade"),
      quantity: z
        .number()
        .min(1)
        .describe("Number of outcome tokens to trade (must be >= 1)"),
      slippage_bps: z
        .number()
        .min(0)
        .max(1000)
        .optional()
        .default(DEFAULT_SLIPPAGE_BPS)
        .describe("Slippage tolerance in basis points (default: 200 = 2%)"),
    }),
    execute: async ({
      exchange,
      id,
      side,
      outcome,
      quantity,
      slippage_bps = DEFAULT_SLIPPAGE_BPS,
    }): Promise<PlaceOrderResult> => {
      console.log("[placeMarketOrder] Executing:", {
        exchange,
        id,
        side,
        outcome,
        quantity,
        slippage_bps,
      });

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

        return executeKalshiMarketOrder({
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

        return executePolymarketMarketOrder({
          tokenId: id,
          side,
          quantity,
          wallet: polymarketWallet,
        });
      }
    },
  });
}

// ============================================================================
// Export
// ============================================================================

export const placeMarketOrderTool = createPlaceMarketOrderTool;
