// ============================================================================
// Withdraw USDC Tool
// Bridge USDC from Polygon back to Solana via Manual Bridge
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import type { KeyPairSigner } from "@solana/kit";
import type { PolygonWallet } from "@/lib/crypto/polygon/client";
import {
  bridgePolygonToSolana,
  getVaultBalances,
} from "@/lib/prediction-market/rebalancing/manualBridge";
import { getCurrencyBalance } from "@/lib/crypto/solana/client";

// ============================================================================
// Types
// ============================================================================

export interface WithdrawSigners {
  evm?: {
    address: string;
    wallet: PolygonWallet;
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
  error?: string;
}

export interface QuoteResult {
  success: boolean;
  amount: number;
  vault_available: number;
  can_bridge: boolean;
  error?: string;
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create withdrawToSolana tool bound to agent signers
 * Allows agents to withdraw USDC.e from Polygon back to Solana via manual bridge
 *
 * @param signers - Agent signers with EVM and SVM keys
 */
export function createWithdrawToSolanaTool(signers: WithdrawSigners) {
  return tool({
    description:
      "Withdraw USDC from Polygon (Polymarket) back to Solana (Kalshi) via bridge vault. " +
      "Use this to move funds from Polymarket profits back to your main Solana wallet. " +
      "Completes in seconds (no external bridge delays).",
    inputSchema: z.object({
      amount: z.number().positive().describe("Amount of USDC to withdraw"),
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

      // Quote only mode - check vault liquidity
      if (quote_only) {
        console.log(`${logPrefix} Getting withdrawal quote for $${amount}`);
        const vaults = await getVaultBalances();

        if (!vaults) {
          return {
            success: false,
            amount,
            vault_available: 0,
            can_bridge: false,
            error: "Bridge vaults not configured",
          };
        }

        return {
          success: true,
          amount,
          vault_available: vaults.svm.usdc,
          can_bridge: vaults.svm.usdc >= amount,
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
        const result = await bridgePolygonToSolana(
          amount,
          signers.evm.wallet,
          signers.svm.address
        );

        if (result.success) {
          console.log(`${logPrefix} Withdrawal successful!`);

          // Get new Solana balance
          const newBalance = await getCurrencyBalance(
            signers.svm.address,
            "USDC"
          );

          return {
            success: true,
            source_tx_hash: result.sourceTxHash,
            destination_tx_hash: result.destinationTxHash,
            amount_withdrawn: result.amountBridged,
            new_solana_balance: newBalance
              ? Number(newBalance.formatted)
              : undefined,
          };
        } else {
          console.error(`${logPrefix} Withdrawal failed: ${result.error}`);
          return {
            success: false,
            source_tx_hash: result.sourceTxHash,
            amount_withdrawn: 0,
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
