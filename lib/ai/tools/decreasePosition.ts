// ============================================================================
// Decrease Position Tool
// Sell YES or NO outcome tokens to reduce or close a position
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type KeyPairSigner } from "@solana/kit";
import { executeTrade, type TradeResult } from "@/lib/dflow/trade/trade";
import { resolveMints, getTradeMintsForSell } from "./utils/resolveMints";

// ============================================================================
// Types
// ============================================================================

interface DecreasePositionResult {
  success: boolean;
  market_ticker: string;
  side: "yes" | "no";
  resolved_mints: {
    input_mint: string;
    output_mint: string;
  };
  sold_quantity: number;
  avg_price: number;
  total_proceeds: number;
  signature: string;
  execution_mode: "sync" | "async";
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** USDC has 6 decimals */
const USDC_DECIMALS = 6;

/** Outcome tokens have 6 decimals */
const OUTCOME_DECIMALS = 6;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create decreasePosition tool bound to a wallet and signer
 *
 * @param walletAddress - Public wallet address
 * @param signer - KeyPairSigner for signing transactions (optional for dry-run)
 */
export function createDecreasePositionTool(
  walletAddress: string,
  signer?: KeyPairSigner,
) {
  return tool({
    description:
      "Sell YES or NO outcome tokens to reduce or close a prediction market position. Specify the quantity of tokens to sell. You will receive USDC based on the current market price.",
    inputSchema: z.object({
      market_ticker: z
        .string()
        .describe("Market identifier (e.g., 'BTC-100K-2024')"),
      side: z.enum(["yes", "no"]).describe("Outcome to sell: 'yes' or 'no'"),
      quantity: z
        .number()
        .positive()
        .describe("Number of outcome tokens to sell"),
      slippage_bps: z
        .number()
        .min(0)
        .max(1000)
        .optional()
        .default(200)
        .describe("Slippage tolerance in basis points (default: 200 = 2%)"),
    }),
    execute: async ({
      market_ticker,
      side,
      quantity,
      slippage_bps,
    }): Promise<DecreasePositionResult> => {
      console.log("[decreasePosition] Executing:", {
        wallet: walletAddress,
        market_ticker,
        side,
        quantity,
        slippage_bps,
      });

      try {
        // Check if signer is available
        if (!signer) {
          return {
            success: false,
            market_ticker,
            side,
            resolved_mints: { input_mint: "", output_mint: "" },
            sold_quantity: 0,
            avg_price: 0,
            total_proceeds: 0,
            signature: "",
            execution_mode: "sync",
            error:
              "No signer available. Cannot execute trades without a wallet signer.",
          };
        }

        // Step 1: Resolve market ticker to mint addresses
        const resolved = await resolveMints(market_ticker);

        // Check market is active (can sell in active markets)
        if (resolved.status !== "active") {
          return {
            success: false,
            market_ticker,
            side,
            resolved_mints: { input_mint: "", output_mint: "" },
            sold_quantity: 0,
            avg_price: 0,
            total_proceeds: 0,
            signature: "",
            execution_mode: "sync",
            error: `Market is not active. Current status: ${resolved.status}. Use redeemPosition for resolved markets.`,
          };
        }

        // Step 2: Get trade mints (selling: outcome token → USDC)
        const { inputMint, outputMint } = getTradeMintsForSell(resolved, side);

        // Step 3: Calculate amount (selling by quantity, scaled to 6 decimals)
        const tradeAmount = Math.floor(
          quantity * Math.pow(10, OUTCOME_DECIMALS),
        );

        console.log("[decreasePosition] Trade params:", {
          inputMint: inputMint.slice(0, 8) + "...",
          outputMint: outputMint.slice(0, 8) + "...",
          amount: tradeAmount,
          slippageBps: slippage_bps,
        });

        // Step 4: Execute trade
        const tradeResult: TradeResult = await executeTrade(
          {
            inputMint,
            outputMint,
            amount: tradeAmount,
            userPublicKey: walletAddress,
            slippageBps: slippage_bps,
            predictionMarketSlippageBps: slippage_bps,
          },
          signer,
        );

        if (!tradeResult.success) {
          return {
            success: false,
            market_ticker,
            side,
            resolved_mints: { input_mint: inputMint, output_mint: outputMint },
            sold_quantity: 0,
            avg_price: 0,
            total_proceeds: 0,
            signature: tradeResult.signature,
            execution_mode: tradeResult.executionMode,
            error: tradeResult.error || "Trade execution failed",
          };
        }

        // Step 5: Calculate results
        const inAmount =
          Number(tradeResult.inAmount) / Math.pow(10, OUTCOME_DECIMALS);
        const outAmount =
          Number(tradeResult.outAmount) / Math.pow(10, USDC_DECIMALS);
        const avgPrice = inAmount > 0 ? outAmount / inAmount : 0;

        console.log("[decreasePosition] Trade successful:", {
          signature: tradeResult.signature,
          sold: inAmount,
          proceeds: outAmount,
          avgPrice,
        });

        return {
          success: true,
          market_ticker,
          side,
          resolved_mints: { input_mint: inputMint, output_mint: outputMint },
          sold_quantity: inAmount,
          avg_price: avgPrice,
          total_proceeds: outAmount,
          signature: tradeResult.signature,
          execution_mode: tradeResult.executionMode,
        };
      } catch (error) {
        console.error("[decreasePosition] Error:", error);
        return {
          success: false,
          market_ticker,
          side,
          resolved_mints: { input_mint: "", output_mint: "" },
          sold_quantity: 0,
          avg_price: 0,
          total_proceeds: 0,
          signature: "",
          execution_mode: "sync",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

// ============================================================================
// Export
// ============================================================================

export const decreasePositionTool = createDecreasePositionTool;
