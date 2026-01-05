// ============================================================================
// Redeem Position Tool
// Redeem winning outcome tokens after market resolution
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type KeyPairSigner } from "@solana/kit";
import { executeTrade, type TradeResult } from "@/lib/dflow/trade/trade";
import {
  checkRedemptionEligibility,
  requestRedemptionOrder,
} from "@/lib/dflow/prediction-markets/redeem";
import { getUserPositions } from "@/lib/dflow/prediction-markets/retrieve";
import { resolveMints, getOutcomeMint } from "./utils/resolveMints";
import {
  signAndSubmitTransaction,
  signWithMultipleSignersAndSubmit,
} from "@/lib/solana/transactions";
import { getSponsorSigner, getSponsorAddress } from "@/lib/solana/sponsor";

// ============================================================================
// Types
// ============================================================================

interface RedeemPositionResult {
  success: boolean;
  market_ticker: string;
  side: "yes" | "no";
  is_redeemable: boolean;
  redemption_reason?: string;
  payout_pct: number;
  redeemed_quantity: number;
  payout_amount: number;
  signature?: string;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Outcome tokens have 6 decimals */
const OUTCOME_DECIMALS = 6;

/** USDC has 6 decimals */
const USDC_DECIMALS = 6;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create redeemPosition tool bound to a wallet and signer
 *
 * @param walletAddress - Public wallet address
 * @param signer - KeyPairSigner for signing transactions (optional for dry-run)
 */
export function createRedeemPositionTool(
  walletAddress: string,
  signer?: KeyPairSigner,
) {
  return tool({
    description:
      "Redeem winning outcome tokens after a prediction market resolves. Returns USDC payout for correct predictions. Use retrievePosition first to find redeemable positions.",
    inputSchema: z.object({
      market_ticker: z.string().describe("Market to redeem from"),
      side: z
        .enum(["yes", "no"])
        .describe("Outcome token to redeem ('yes' or 'no')"),
      quantity: z
        .number()
        .positive()
        .optional()
        .describe("Tokens to redeem. Omit to redeem your entire position."),
    }),
    execute: async ({
      market_ticker,
      side,
      quantity,
    }): Promise<RedeemPositionResult> => {
      console.log("[redeemPosition] Executing:", {
        wallet: walletAddress,
        market_ticker,
        side,
        quantity,
      });

      try {
        // Check if signer is available
        if (!signer) {
          return {
            success: false,
            market_ticker,
            side,
            is_redeemable: false,
            redemption_reason: "No signer available",
            payout_pct: 0,
            redeemed_quantity: 0,
            payout_amount: 0,
            error:
              "No signer available. Cannot execute redemption without a wallet signer.",
          };
        }

        // Step 1: Resolve market ticker to get outcome mint
        const resolved = await resolveMints(market_ticker);
        const outcomeMint = getOutcomeMint(resolved, side);

        // Step 2: Check redemption eligibility
        const eligibility = await checkRedemptionEligibility(
          outcomeMint,
          resolved.settlement_mint,
        );

        if (!eligibility.isRedeemable) {
          return {
            success: false,
            market_ticker,
            side,
            is_redeemable: false,
            redemption_reason: eligibility.reason,
            payout_pct: eligibility.payoutPct ?? 0,
            redeemed_quantity: 0,
            payout_amount: 0,
          };
        }

        // Step 3: Determine quantity to redeem
        let redeemQuantity = quantity;

        if (redeemQuantity === undefined) {
          // Get full position balance
          const positions = await getUserPositions(walletAddress);
          const matchingPosition = positions.positions.find(
            (p) => p.mint === outcomeMint,
          );

          if (!matchingPosition || matchingPosition.quantity <= 0) {
            return {
              success: false,
              market_ticker,
              side,
              is_redeemable: true,
              redemption_reason: "No tokens to redeem",
              payout_pct: eligibility.payoutPct ?? 1.0,
              redeemed_quantity: 0,
              payout_amount: 0,
              error: `No ${side.toUpperCase()} tokens found in wallet`,
            };
          }

          redeemQuantity = matchingPosition.quantity;
        }

        // Step 4: Get sponsor if available
        const sponsorAddress = await getSponsorAddress();
        const sponsorSigner = await getSponsorSigner();

        // Step 5: Request redemption order
        const scaledAmount = Math.floor(
          redeemQuantity * Math.pow(10, OUTCOME_DECIMALS),
        );

        console.log("[redeemPosition] Requesting redemption:", {
          outcomeMint: outcomeMint.slice(0, 8) + "...",
          settlementMint: resolved.settlement_mint.slice(0, 8) + "...",
          amount: scaledAmount,
          sponsor: sponsorAddress
            ? sponsorAddress.slice(0, 8) + "..."
            : undefined,
        });

        const order = await requestRedemptionOrder(
          outcomeMint,
          resolved.settlement_mint,
          scaledAmount,
          walletAddress,
          sponsorAddress ?? undefined,
        );

        // Step 6: Sign and submit the redemption transaction
        let signature: string;

        if (sponsorSigner) {
          // Dual signing: user + sponsor
          signature = await signWithMultipleSignersAndSubmit(
            order.transaction,
            [signer, sponsorSigner],
          );
          console.log(
            "[redeemPosition] Sponsored redemption submitted:",
            signature,
          );
        } else {
          // Single signing: user pays fees
          signature = await signAndSubmitTransaction(order.transaction, signer);
          console.log("[redeemPosition] Redemption submitted:", signature);
        }

        // Step 7: Calculate results
        const inAmount =
          Number(order.inAmount) / Math.pow(10, OUTCOME_DECIMALS);
        const outAmount = Number(order.outAmount) / Math.pow(10, USDC_DECIMALS);

        return {
          success: true,
          market_ticker,
          side,
          is_redeemable: true,
          payout_pct: eligibility.payoutPct ?? 1.0,
          redeemed_quantity: inAmount,
          payout_amount: outAmount,
          signature,
        };
      } catch (error) {
        console.error("[redeemPosition] Error:", error);
        return {
          success: false,
          market_ticker,
          side,
          is_redeemable: false,
          payout_pct: 0,
          redeemed_quantity: 0,
          payout_amount: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

// ============================================================================
// Export
// ============================================================================

export const redeemPositionTool = createRedeemPositionTool;
