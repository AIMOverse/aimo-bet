// ============================================================================
// Wormhole Bridge - Polygon to Solana
// Bridge USDC.e from Polygon back to Solana via Wormhole Token Bridge
// ============================================================================

import { wormhole, TokenTransfer, Wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import type { Wallet } from "ethers";
import type { KeyPairSigner } from "@solana/kit";
import { getUsdcBalance } from "@/lib/crypto/polygon/client";
import {
  getTokenBalanceByOwner,
  TOKEN_MINTS,
} from "@/lib/crypto/solana/client";

// ============================================================================
// Constants
// ============================================================================

const POLL_INTERVAL_MS = 30_000; // 30 seconds (Wormhole attestation takes longer)
const MAX_WAIT_MS = 30 * 60_000; // 30 minutes (Wormhole can take time)
const MIN_BRIDGE_AMOUNT = 1; // Minimum $1 USDC

// USDC.e contract on Polygon (bridged USDC)
const POLYGON_USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

// ============================================================================
// Types
// ============================================================================

export interface WithdrawResult {
  /** Whether the withdrawal completed successfully */
  success: boolean;
  /** Source chain transaction hash */
  sourceTxHash: string;
  /** Destination chain transaction hash (if completed) */
  destinationTxHash?: string;
  /** Amount that was bridged (in USDC) */
  amountBridged: number;
  /** New Solana balance after bridge (if successful) */
  newBalance?: number;
  /** Error message (if failed) */
  error?: string;
  /** Transfer state for tracking */
  state?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get Solana USDC balance
 */
async function getSolanaUSDCBalance(walletAddress: string): Promise<number> {
  const balance = await getTokenBalanceByOwner(walletAddress, TOKEN_MINTS.USDC);
  if (!balance) return 0;
  return Number(balance.formatted);
}

/**
 * Get Polygon USDC.e balance
 */
async function getPolygonUSDCBalance(walletAddress: string): Promise<number> {
  const result = await getUsdcBalance(walletAddress);
  return result?.balance ?? 0;
}

// ============================================================================
// Wormhole Signer Adapters
// ============================================================================

/**
 * Create a Wormhole EVM signer from ethers Wallet
 */
function createEvmSigner(wallet: Wallet) {
  return {
    chain: () => "Polygon" as const,
    address: () => wallet.address,
    signAndSend: async (txs: any[]) => {
      const txids: string[] = [];
      for (const tx of txs) {
        const sent = await wallet.sendTransaction(tx);
        const receipt = await sent.wait();
        txids.push(receipt?.hash || sent.hash);
      }
      return txids;
    },
  };
}

/**
 * Create a Wormhole Solana signer from KeyPairSigner
 */
function createSolanaSigner(signer: KeyPairSigner) {
  return {
    chain: () => "Solana" as const,
    address: () => signer.address,
    signAndSend: async (txs: any[]) => {
      const txids: string[] = [];
      for (const tx of txs) {
        // Sign and submit the transaction
        const signedTx = await tx.sign([signer]);
        // The tx should have a send method or we submit it
        const signature = await signedTx.submit();
        txids.push(signature);
      }
      return txids;
    },
  };
}

// ============================================================================
// Main Bridge Function
// ============================================================================

/**
 * Bridge USDC.e from Polygon back to Solana via Wormhole Token Bridge.
 *
 * This is a BLOCKING operation that:
 * 1. Validates the withdrawal amount
 * 2. Checks Polygon USDC.e balance
 * 3. Creates a Wormhole transfer
 * 4. Submits the transfer on Polygon
 * 5. Waits for Wormhole attestation (VAA)
 * 6. Completes the transfer on Solana
 *
 * @param amount - Amount in USDC to withdraw (minimum $1)
 * @param evmWallet - ethers Wallet with USDC.e on Polygon
 * @param svmSigner - Solana KeyPairSigner to receive USDC
 * @returns Withdrawal result with success status and balances
 *
 * @example
 * ```typescript
 * const signers = await createAgentSigners("openai/gpt-5");
 *
 * if (signers.svm && signers.evm) {
 *   const result = await withdrawUSDCToSolana(
 *     100, // $100
 *     signers.evm.wallet,
 *     signers.svm.keyPairSigner
 *   );
 *
 *   if (result.success) {
 *     console.log(`Withdrew $${result.amountBridged}, new Solana balance: $${result.newBalance}`);
 *   }
 * }
 * ```
 */
export async function withdrawUSDCToSolana(
  amount: number,
  evmWallet: Wallet,
  svmSigner: KeyPairSigner
): Promise<WithdrawResult> {
  const logPrefix = "[wormhole/withdraw]";
  const polygonAddress = evmWallet.address;
  const solanaAddress = svmSigner.address;

  console.log(
    `${logPrefix} Starting withdrawal: $${amount} from ${polygonAddress} to ${solanaAddress}`
  );

  // -------------------------------------------------------------------------
  // Step 1: Validate minimum amount
  // -------------------------------------------------------------------------
  if (amount < MIN_BRIDGE_AMOUNT) {
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error: `Minimum withdrawal amount is $${MIN_BRIDGE_AMOUNT}. Requested: $${amount}`,
    };
  }

  // -------------------------------------------------------------------------
  // Step 2: Check Polygon balance
  // -------------------------------------------------------------------------
  const polygonBalance = await getPolygonUSDCBalance(polygonAddress);
  if (polygonBalance < amount) {
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error: `Insufficient Polygon USDC.e balance. Have: $${polygonBalance.toFixed(
        2
      )}, Need: $${amount}`,
    };
  }

  console.log(`${logPrefix} Polygon balance: $${polygonBalance.toFixed(2)}`);

  try {
    // -----------------------------------------------------------------------
    // Step 3: Get initial Solana balance
    // -----------------------------------------------------------------------
    const initialSolBalance = await getSolanaUSDCBalance(solanaAddress);
    console.log(
      `${logPrefix} Initial Solana balance: $${initialSolBalance.toFixed(2)}`
    );

    // -----------------------------------------------------------------------
    // Step 4: Initialize Wormhole SDK
    // -----------------------------------------------------------------------
    console.log(`${logPrefix} Initializing Wormhole SDK...`);
    const wh = await wormhole("Mainnet", [evm, solana]);

    // Get chain contexts
    const srcChain = wh.getChain("Polygon");
    const dstChain = wh.getChain("Solana");

    // -----------------------------------------------------------------------
    // Step 5: Create token transfer
    // -----------------------------------------------------------------------
    console.log(`${logPrefix} Creating token transfer...`);

    // Amount in base units (USDC has 6 decimals)
    const amountUnits = BigInt(Math.floor(amount * 1_000_000));

    // Create token ID and addresses using Wormhole helpers
    const tokenId = Wormhole.tokenId("Polygon", POLYGON_USDC_ADDRESS);
    const sourceAddress = Wormhole.chainAddress("Polygon", polygonAddress);
    const destinationAddress = Wormhole.chainAddress("Solana", solanaAddress);

    // Create the transfer using Wormhole SDK
    // TokenTransfer handles the complexity of cross-chain transfers
    const transfer = await wh.tokenTransfer(
      // Token ID - USDC.e on Polygon
      tokenId,
      // Amount in base units
      amountUnits,
      // Source address
      sourceAddress,
      // Destination address
      destinationAddress,
      // Use manual (non-automatic) transfer - we'll complete it ourselves
      "TokenBridge"
    );

    console.log(`${logPrefix} Transfer created, initiating on Polygon...`);

    // -----------------------------------------------------------------------
    // Step 6: Initiate transfer on Polygon (source chain)
    // -----------------------------------------------------------------------
    const evmSigner = createEvmSigner(evmWallet);
    const srcTxIds = await transfer.initiateTransfer(evmSigner as any);
    const sourceTxHash = srcTxIds[0] || "";

    console.log(`${logPrefix} Transfer initiated, tx: ${sourceTxHash}`);

    // -----------------------------------------------------------------------
    // Step 7: Wait for attestation (VAA)
    // -----------------------------------------------------------------------
    console.log(
      `${logPrefix} Waiting for Wormhole attestation (this may take several minutes)...`
    );

    const startTime = Date.now();
    let attestation;

    while (Date.now() - startTime < MAX_WAIT_MS) {
      try {
        attestation = await transfer.fetchAttestation(60_000);
        if (attestation) {
          console.log(`${logPrefix} Attestation received!`);
          break;
        }
      } catch (e) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`${logPrefix} [${elapsed}s] Waiting for attestation...`);
      }
      await sleep(POLL_INTERVAL_MS);
    }

    if (!attestation) {
      return {
        success: false,
        sourceTxHash,
        amountBridged: amount,
        state: "attestation_timeout",
        error:
          "Attestation timeout - transfer initiated but VAA not received. " +
          "You can complete the transfer manually later using the source tx hash.",
      };
    }

    // -----------------------------------------------------------------------
    // Step 8: Complete transfer on Solana (destination chain)
    // -----------------------------------------------------------------------
    console.log(`${logPrefix} Completing transfer on Solana...`);

    const solanaSigner = createSolanaSigner(svmSigner);
    const dstTxIds = await transfer.completeTransfer(solanaSigner as any);
    const destinationTxHash = dstTxIds[0] || "";

    console.log(
      `${logPrefix} Transfer completed on Solana, tx: ${destinationTxHash}`
    );

    // -----------------------------------------------------------------------
    // Step 9: Verify new balance
    // -----------------------------------------------------------------------
    // Wait a bit for the balance to update
    await sleep(5000);

    const newSolBalance = await getSolanaUSDCBalance(solanaAddress);
    console.log(
      `${logPrefix} Withdrawal complete! New Solana balance: $${newSolBalance.toFixed(
        2
      )}`
    );

    return {
      success: true,
      sourceTxHash,
      destinationTxHash,
      amountBridged: amount,
      newBalance: newSolBalance,
      state: "completed",
    };
  } catch (error) {
    console.error(`${logPrefix} Withdrawal error:`, error);
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error:
        error instanceof Error ? error.message : "Unknown withdrawal error",
    };
  }
}

/**
 * Get a quote for withdrawing USDC from Polygon to Solana.
 * This estimates fees and timing without executing the transfer.
 *
 * @param amount - Amount in USDC to withdraw
 * @returns Quote with estimated fees and timing
 */
export async function getWithdrawalQuote(amount: number): Promise<{
  amount: number;
  estimatedFee: number;
  estimatedTime: string;
  minAmount: number;
}> {
  // Wormhole Token Bridge fees are minimal (just gas on both chains)
  // The main cost is gas on Polygon + Solana transaction fees
  const estimatedFee = 0.5; // ~$0.50 in gas fees total

  return {
    amount,
    estimatedFee,
    estimatedTime: "10-30 minutes",
    minAmount: MIN_BRIDGE_AMOUNT,
  };
}
