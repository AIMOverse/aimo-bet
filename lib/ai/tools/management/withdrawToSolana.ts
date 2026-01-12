// ============================================================================
// Withdraw USDC Tool
// Bridge USDC from Polygon back to Solana via Wormhole
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import type { Wallet } from "ethers";
import type { KeyPairSigner } from "@solana/kit";
import {
  withdrawUSDCToSolana,
  getWithdrawalQuote,
} from "@/lib/prediction-market/polymarket/wormhole";

// ============================================================================
// Types
// ============================================================================

export interface WithdrawSigners {
  evm?: {
    address: string;
    wallet: Wallet;
  };
  svm?: {
    address: string;
    keyPairSigner: KeyPairSigner;
  };
}

export interface WithdrawResult {
  success: boolean;
  source_tx_hash: string;
  destination_tx_hash?: string;
  amount_withdrawn: number;
  new_solana_balance?: number;
  state?: string;
  error?: string;
}

export interface QuoteResult {
  success: boolean;
  amount: number;
  estimated_fee: number;
  estimated_time: string;
  min_amount: number;
  error?: string;
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create withdrawToSolana tool bound to agent signers
 * Allows agents to withdraw USDC.e from Polygon back to Solana via Wormhole
 *
 * @param signers - Agent signers with EVM and SVM keys
 */
export function createWithdrawToSolanaTool(signers: WithdrawSigners) {
  return tool({
    description:
      "Withdraw USDC from Polygon (Polymarket) back to Solana (Kalshi) via Wormhole bridge. " +
      "Use this to move funds from Polymarket profits back to your main Solana wallet. " +
      "Takes 10-30 minutes to complete. Minimum withdrawal is $1.",
    inputSchema: z.object({
      amount: z
        .number()
        .positive()
        .describe("Amount of USDC to withdraw (minimum $1)"),
      quote_only: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, only returns a quote without executing the withdrawal"
        ),
    }),
    execute: async ({
      amount,
      quote_only,
    }): Promise<WithdrawResult | QuoteResult> => {
      const logPrefix = "[management/withdrawToSolana]";

      // Quote only mode
      if (quote_only) {
        console.log(`${logPrefix} Getting withdrawal quote for $${amount}`);
        const quote = await getWithdrawalQuote(amount);
        return {
          success: true,
          amount: quote.amount,
          estimated_fee: quote.estimatedFee,
          estimated_time: quote.estimatedTime,
          min_amount: quote.minAmount,
        };
      }

      // Validate signers
      if (!signers.evm?.wallet) {
        return {
          success: false,
          source_tx_hash: "",
          amount_withdrawn: 0,
          error:
            "No Polygon wallet configured. Cannot withdraw from Polymarket.",
        };
      }

      if (!signers.svm?.keyPairSigner) {
        return {
          success: false,
          source_tx_hash: "",
          amount_withdrawn: 0,
          error: "No Solana signer configured. Cannot receive on Solana.",
        };
      }

      console.log(`${logPrefix} Initiating withdrawal of $${amount}`);
      console.log(`${logPrefix} From: ${signers.evm.address} (Polygon)`);
      console.log(`${logPrefix} To: ${signers.svm.address} (Solana)`);

      try {
        const result = await withdrawUSDCToSolana(
          amount,
          signers.evm.wallet,
          signers.svm.keyPairSigner
        );

        if (result.success) {
          console.log(`${logPrefix} Withdrawal successful!`);
          return {
            success: true,
            source_tx_hash: result.sourceTxHash,
            destination_tx_hash: result.destinationTxHash,
            amount_withdrawn: result.amountBridged,
            new_solana_balance: result.newBalance,
            state: result.state,
          };
        } else {
          console.error(`${logPrefix} Withdrawal failed: ${result.error}`);
          return {
            success: false,
            source_tx_hash: result.sourceTxHash,
            amount_withdrawn: 0,
            state: result.state,
            error: result.error,
          };
        }
      } catch (error) {
        console.error(`${logPrefix} Error:`, error);
        return {
          success: false,
          source_tx_hash: "",
          amount_withdrawn: 0,
          error:
            error instanceof Error
              ? error.message
              : "Unknown error during withdrawal",
        };
      }
    },
  });
}

/**
 * Default instance of the withdraw tool (requires runtime signers)
 * Use createWithdrawToSolanaTool() to bind to specific agent signers
 */
export const withdrawToSolanaTool = createWithdrawToSolanaTool({});
