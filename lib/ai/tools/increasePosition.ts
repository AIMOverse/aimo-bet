// ============================================================================
// Increase Position Tool
// Buy YES or NO outcome tokens to open or increase a position
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type KeyPairSigner } from "@solana/kit";
import { executeTrade, type TradeResult } from "@/lib/dflow/trade/trade";
import { resolveMints, getTradeMintsForBuy } from "./utils/resolveMints";

// ============================================================================
// Types
// ============================================================================

interface IncreasePositionResult {
  success: boolean;
  market_ticker: string;
  side: "yes" | "no";
  resolved_mints: {
    input_mint: string;
    output_mint: string;
  };
  filled_quantity: number;
  avg_price: number;
  total_cost: number;
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
 * Create increasePosition tool bound to a wallet and signer
 *
 * @param walletAddress - Public wallet address
 * @param signer - KeyPairSigner for signing transactions (optional for dry-run)
 */
export function createIncreasePositionTool(
  walletAddress: string,
  signer?: KeyPairSigner,
) {
  return tool({
    description:
      "Buy YES or NO outcome tokens to open or increase a prediction market position. Specify either USDC amount to spend OR quantity of tokens to buy (not both). Each outcome token pays $1 if the prediction is correct.",
    inputSchema: z
      .object({
        market_ticker: z
          .string()
          .describe("Market identifier (e.g., 'BTC-100K-2024')"),
        side: z.enum(["yes", "no"]).describe("Outcome to buy: 'yes' or 'no'"),
        usdc_amount: z
          .number()
          .positive()
          .optional()
          .describe(
            "USDC to spend. Mutually exclusive with 'quantity'. Example: 10 means spend $10 USDC.",
          ),
        quantity: z
          .number()
          .positive()
          .optional()
          .describe(
            "Outcome tokens to buy. Each token pays $1 if correct. Mutually exclusive with 'usdc_amount'.",
          ),
        slippage_bps: z
          .number()
          .min(0)
          .max(1000)
          .optional()
          .default(200)
          .describe("Slippage tolerance in basis points (default: 200 = 2%)"),
      })
      .refine(
        (data) =>
          (data.usdc_amount !== undefined) !== (data.quantity !== undefined),
        "Provide exactly one of 'usdc_amount' or 'quantity'",
      ),
    execute: async ({
      market_ticker,
      side,
      usdc_amount,
      quantity,
      slippage_bps,
    }): Promise<IncreasePositionResult> => {
      console.log("[increasePosition] Executing:", {
        wallet: walletAddress,
        market_ticker,
        side,
        usdc_amount,
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
            filled_quantity: 0,
            avg_price: 0,
            total_cost: 0,
            signature: "",
            execution_mode: "sync",
            error:
              "No signer available. Cannot execute trades without a wallet signer.",
          };
        }

        // Step 1: Resolve market ticker to mint addresses
        const resolved = await resolveMints(market_ticker);

        // Check market is active
        if (resolved.status !== "active") {
          return {
            success: false,
            market_ticker,
            side,
            resolved_mints: { input_mint: "", output_mint: "" },
            filled_quantity: 0,
            avg_price: 0,
            total_cost: 0,
            signature: "",
            execution_mode: "sync",
            error: `Market is not active. Current status: ${resolved.status}`,
          };
        }

        // Step 2: Get trade mints (buying: USDC → outcome token)
        const { inputMint, outputMint } = getTradeMintsForBuy(resolved, side);

        // Step 3: Calculate amount
        // When buying with USDC, amount is the USDC amount scaled to 6 decimals
        // When buying by quantity, we need to estimate USDC from price (simplified: assume 0.5)
        let tradeAmount: number;

        if (usdc_amount !== undefined) {
          // Spending USDC: scale to 6 decimals
          tradeAmount = Math.floor(usdc_amount * Math.pow(10, USDC_DECIMALS));
        } else {
          // Buying by quantity: estimate USDC needed
          // For simplicity, assume ~0.5 price (this is a rough estimate)
          // The actual fill will depend on market price
          const estimatedPrice = 0.5;
          const estimatedUsdc = quantity! * estimatedPrice;
          tradeAmount = Math.floor(estimatedUsdc * Math.pow(10, USDC_DECIMALS));
        }

        console.log("[increasePosition] Trade params:", {
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
            filled_quantity: 0,
            avg_price: 0,
            total_cost: 0,
            signature: tradeResult.signature,
            execution_mode: tradeResult.executionMode,
            error: tradeResult.error || "Trade execution failed",
          };
        }

        // Step 5: Calculate results
        const inAmount =
          Number(tradeResult.inAmount) / Math.pow(10, USDC_DECIMALS);
        const outAmount =
          Number(tradeResult.outAmount) / Math.pow(10, OUTCOME_DECIMALS);
        const avgPrice = outAmount > 0 ? inAmount / outAmount : 0;

        console.log("[increasePosition] Trade successful:", {
          signature: tradeResult.signature,
          filled: outAmount,
          cost: inAmount,
          avgPrice,
        });

        return {
          success: true,
          market_ticker,
          side,
          resolved_mints: { input_mint: inputMint, output_mint: outputMint },
          filled_quantity: outAmount,
          avg_price: avgPrice,
          total_cost: inAmount,
          signature: tradeResult.signature,
          execution_mode: tradeResult.executionMode,
        };
      } catch (error) {
        console.error("[increasePosition] Error:", error);

        return {
          success: false,
          market_ticker,
          side,
          resolved_mints: { input_mint: "", output_mint: "" },
          filled_quantity: 0,
          avg_price: 0,
          total_cost: 0,
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

export const increasePositionTool = createIncreasePositionTool;
