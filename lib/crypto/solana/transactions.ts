// ============================================================================
// Solana Transaction Utilities
// Transaction signing, submission, and monitoring using @solana/kit (Web3.js 2.0)
// ============================================================================

import {
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  signature as toSignature,
  signTransaction,
  type KeyPairSigner,
  type Signature,
} from "@solana/kit";
import { getRpc } from "./client";
import { sleep } from "@/lib/prediction-market/kalshi/dflow/utils";

// ============================================================================
// Types
// ============================================================================

export interface MonitorOptions {
  /** Polling interval in ms (default: 1000) */
  pollInterval?: number;
  /** Maximum polling attempts (default: 30) */
  maxAttempts?: number;
}

export interface ConfirmationResult {
  success: boolean;
  slot?: bigint;
  confirmationStatus?: "processed" | "confirmed" | "finalized";
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_POLL_INTERVAL = 1000;
const DEFAULT_MAX_ATTEMPTS = 30;

// ============================================================================
// Transaction Signing
// ============================================================================

/**
 * Sign a base64-encoded transaction and return it as base64
 * Does NOT submit to the network - useful for intent-based flows
 *
 * @param transactionBase64 - Base64-encoded transaction
 * @param signer - KeyPairSigner to sign with
 * @returns Signed transaction as base64
 */
export async function signTransactionToBase64(
  transactionBase64: string,
  signer: KeyPairSigner,
): Promise<string> {
  // Decode the base64 transaction to bytes
  const base64Encoder = getBase64Encoder();
  const transactionBytes = base64Encoder.encode(transactionBase64);

  // Decode bytes to Transaction object
  const transactionDecoder = getTransactionDecoder();
  const transaction = transactionDecoder.decode(transactionBytes);

  // Sign the transaction
  const signedTransaction = await signTransaction(
    [signer.keyPair],
    transaction,
  );

  // Encode back to base64
  return getBase64EncodedWireTransaction(signedTransaction);
}

/**
 * Sign and submit a transaction to Solana
 *
 * @param transactionBase64 - Base64-encoded transaction
 * @param signer - KeyPairSigner to sign with
 * @returns Transaction signature (base58)
 */
export async function signAndSubmitTransaction(
  transactionBase64: string,
  signer: KeyPairSigner,
): Promise<string> {
  // Decode the base64 transaction to bytes
  const base64Encoder = getBase64Encoder();
  const transactionBytes = base64Encoder.encode(transactionBase64);

  // Decode bytes to Transaction object
  const transactionDecoder = getTransactionDecoder();
  const transaction = transactionDecoder.decode(transactionBytes);

  // Sign the transaction with the signer's keyPair
  const signedTransaction = await signTransaction(
    [signer.keyPair],
    transaction,
  );

  // Get signature for logging/tracking
  const signature = getSignatureFromTransaction(signedTransaction);

  // Encode to base64 wire format for RPC
  const encodedTransaction = getBase64EncodedWireTransaction(signedTransaction);

  // Send via RPC
  const rpc = getRpc();
  await rpc
    .sendTransaction(encodedTransaction, {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })
    .send();

  return signature;
}

/**
 * Sign a transaction with multiple signers and submit to Solana
 * Used for sponsored transactions where both user and sponsor must sign
 *
 * @param transactionBase64 - Base64-encoded transaction
 * @param signers - Array of KeyPairSigners (user + sponsor)
 * @returns Transaction signature (base58)
 */
export async function signWithMultipleSignersAndSubmit(
  transactionBase64: string,
  signers: KeyPairSigner[],
): Promise<string> {
  // Decode the base64 transaction to bytes
  const base64Encoder = getBase64Encoder();
  const transactionBytes = base64Encoder.encode(transactionBase64);

  // Decode bytes to Transaction object
  const transactionDecoder = getTransactionDecoder();
  const transaction = transactionDecoder.decode(transactionBytes);

  // Sign with all signers
  const keyPairs = signers.map((s) => s.keyPair);
  const signedTransaction = await signTransaction(keyPairs, transaction);

  // Get signature for logging/tracking
  const signature = getSignatureFromTransaction(signedTransaction);

  // Encode to base64 wire format for RPC
  const encodedTransaction = getBase64EncodedWireTransaction(signedTransaction);

  // Send via RPC
  const rpc = getRpc();
  await rpc
    .sendTransaction(encodedTransaction, {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })
    .send();

  return signature;
}

// ============================================================================
// Transaction Monitoring
// ============================================================================

/**
 * Monitor transaction until confirmation using RPC getSignatureStatuses
 *
 * @param signatureStr - Transaction signature (base58)
 * @param options - Monitoring options
 * @returns Confirmation result
 */
export async function monitorTransactionConfirmation(
  signatureStr: string,
  options: MonitorOptions = {},
): Promise<ConfirmationResult> {
  const {
    pollInterval = DEFAULT_POLL_INTERVAL,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;

  const rpc = getRpc();
  const sig: Signature = toSignature(signatureStr);

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const { value } = await rpc.getSignatureStatuses([sig]).send();
      const status = value[0];

      if (!status) {
        await sleep(pollInterval);
        continue;
      }

      // Check if transaction failed
      if (status.err) {
        return {
          success: false,
          slot: status.slot,
          confirmationStatus: status.confirmationStatus ?? undefined,
          error: JSON.stringify(status.err),
        };
      }

      // Wait for confirmed or finalized
      if (
        status.confirmationStatus === "finalized" ||
        status.confirmationStatus === "confirmed"
      ) {
        return {
          success: true,
          slot: status.slot,
          confirmationStatus: status.confirmationStatus,
        };
      }

      // Still processing, continue polling
      await sleep(pollInterval);
    } catch (error) {
      if (attempts < maxAttempts) {
        await sleep(pollInterval);
        continue;
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Max attempts reached
  return {
    success: false,
    error: "Transaction confirmation timeout",
  };
}

/**
 * Get transaction status without monitoring loop
 * Useful for one-off status checks
 *
 * @param signatureStr - Transaction signature (base58)
 * @returns Confirmation result
 */
export async function getTransactionStatus(
  signatureStr: string,
): Promise<ConfirmationResult> {
  const rpc = getRpc();
  const sig: Signature = toSignature(signatureStr);

  try {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const status = value[0];

    if (!status) {
      return {
        success: false,
        error: "Transaction not found",
      };
    }

    if (status.err) {
      return {
        success: false,
        slot: status.slot,
        confirmationStatus: status.confirmationStatus ?? undefined,
        error: JSON.stringify(status.err),
      };
    }

    const isConfirmed =
      status.confirmationStatus === "confirmed" ||
      status.confirmationStatus === "finalized";

    return {
      success: isConfirmed,
      slot: status.slot,
      confirmationStatus: status.confirmationStatus ?? undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
