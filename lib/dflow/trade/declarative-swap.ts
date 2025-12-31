// ============================================================================
// dflow Declarative Swap Execution
// High-level declarative swap (intent) execution with transaction signing and monitoring
// Docs: https://pond.dflow.net/quickstart/trade-tokens (Declarative Swaps)
// ============================================================================

import { type KeyPairSigner } from "@solana/kit";
import { dflowQuoteFetch } from "@/lib/dflow/client";
import { sleep } from "@/lib/dflow/utils";
import {
  createSignerFromBase58SecretKey,
  createSignerFromBase58PrivateKey,
} from "@/lib/solana/wallets";
import { signTransactionToBase64 } from "@/lib/solana/transactions";

// ============================================================================
// Types
// ============================================================================

export interface IntentRequest {
  inputMint: string;
  outputMint: string;
  amount: number; // Scaled integer (e.g., 1 SOL = 1_000_000_000)
  userPublicKey: string;
  slippageBps: number;
  platformFeeBps?: number;
  feeAccount?: string;
  referralAccount?: string;
  wrapAndUnwrapSol?: boolean;
  feeBudget?: number;
  maxAutoFeeBudget?: number;
}

export interface IntentQuoteResponse {
  feeBudget: number;
  inAmount: string;
  inputMint: string;
  minOutAmount: string;
  otherAmountThreshold: string;
  outAmount: string;
  outputMint: string;
  priceImpactPct: string;
  slippageBps: number;
  expiry: {
    slotsAfterOpen: number;
  };
  lastValidBlockHeight: number;
  openTransaction: string; // Base64-encoded transaction
  platformFee?: unknown;
}

export interface SubmitIntentResponse {
  openTransactionSignature: string; // Base58-encoded signature
  orderAddress: string; // Base58-encoded order address
  programId: string; // Base58-encoded program ID
}

export type OrderStatus =
  | "open"
  | "pendingClose"
  | "closed"
  | "openExpired"
  | "openFailed";

export interface Fill {
  qtyIn: bigint;
  qtyOut: bigint;
  txId: string;
}

export interface MonitorResult {
  status: OrderStatus;
  fills: Fill[];
  transactionError?: string;
}

export interface DeclarativeSwapResult {
  success: boolean;
  signature: string;
  orderAddress: string;
  status: OrderStatus;
  inAmount: string;
  outAmount: string;
  minOutAmount: string;
  fills: Fill[];
  error?: string;
}

export interface MonitorOptions {
  /** Polling interval in ms (default: 2000) */
  pollInterval?: number;
  /** Maximum polling attempts (default: 60 for ~2 min) */
  maxAttempts?: number;
  /** Callback for status updates */
  onStatusUpdate?: (result: MonitorResult) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_MAX_ATTEMPTS = 60; // ~2 minutes with 2s interval

// ============================================================================
// Step 1: Request Intent Quote
// ============================================================================

/**
 * Request a declarative intent quote from dflow
 * This returns a quote with an openTransaction to sign
 */
export async function requestIntentQuote(
  request: IntentRequest,
): Promise<IntentQuoteResponse> {
  const queryParams = new URLSearchParams();
  queryParams.set("inputMint", request.inputMint);
  queryParams.set("outputMint", request.outputMint);
  queryParams.set("amount", request.amount.toString());
  queryParams.set("userPublicKey", request.userPublicKey);
  queryParams.set("slippageBps", request.slippageBps.toString());

  // Optional parameters
  if (request.platformFeeBps !== undefined) {
    queryParams.set("platformFeeBps", request.platformFeeBps.toString());
  }
  if (request.feeAccount !== undefined) {
    queryParams.set("feeAccount", request.feeAccount);
  }
  if (request.referralAccount !== undefined) {
    queryParams.set("referralAccount", request.referralAccount);
  }
  if (request.wrapAndUnwrapSol !== undefined) {
    queryParams.set("wrapAndUnwrapSol", request.wrapAndUnwrapSol.toString());
  }
  if (request.feeBudget !== undefined) {
    queryParams.set("feeBudget", request.feeBudget.toString());
  }
  if (request.maxAutoFeeBudget !== undefined) {
    queryParams.set("maxAutoFeeBudget", request.maxAutoFeeBudget.toString());
  }

  console.log("[declarative-swap] Requesting intent quote:", {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: request.amount,
    userPublicKey: request.userPublicKey,
    slippageBps: request.slippageBps,
  });

  const response = await dflowQuoteFetch(`/intent?${queryParams.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to request intent quote: ${response.status} - ${errorText}`,
    );
  }

  const data = (await response.json()) as IntentQuoteResponse;

  console.log("[declarative-swap] Intent quote response:", {
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    minOutAmount: data.minOutAmount,
    priceImpactPct: data.priceImpactPct,
    feeBudget: data.feeBudget,
    slippageBps: data.slippageBps,
    hasOpenTransaction: !!data.openTransaction,
  });

  return data;
}

// ============================================================================
// Step 2: Sign the Intent
// ============================================================================

/**
 * Sign the openTransaction from the intent quote
 * Returns the signed transaction as base64
 */
export async function signIntentTransaction(
  openTransactionBase64: string,
  signer: KeyPairSigner,
): Promise<string> {
  const signedBase64 = await signTransactionToBase64(
    openTransactionBase64,
    signer,
  );

  console.log("[declarative-swap] Transaction signed");

  return signedBase64;
}

// ============================================================================
// Step 3: Submit the Intent
// ============================================================================

/**
 * Submit the signed intent to dflow for execution
 */
export async function submitIntent(
  quoteResponse: IntentQuoteResponse,
  signedOpenTransaction: string,
): Promise<SubmitIntentResponse> {
  console.log("[declarative-swap] Submitting intent:", {
    inputMint: quoteResponse.inputMint,
    outputMint: quoteResponse.outputMint,
    inAmount: quoteResponse.inAmount,
    outAmount: quoteResponse.outAmount,
    minOutAmount: quoteResponse.minOutAmount,
  });

  const response = await dflowQuoteFetch("/submit-intent", {
    method: "POST",
    body: JSON.stringify({
      quoteResponse,
      signedOpenTransaction,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to submit intent: ${response.status} - ${errorText}`,
    );
  }

  const data = (await response.json()) as SubmitIntentResponse;

  console.log("[declarative-swap] Intent submitted:", {
    openTransactionSignature: data.openTransactionSignature,
    orderAddress: data.orderAddress,
    programId: data.programId,
  });

  return data;
}

// ============================================================================
// Step 4: Monitor the Intent
// ============================================================================

/**
 * Monitor the intent order status until completion
 * Uses the order-status endpoint to poll for fills
 */
export async function monitorIntent(
  signature: string,
  options: MonitorOptions = {},
): Promise<MonitorResult> {
  const {
    pollInterval = DEFAULT_POLL_INTERVAL,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    onStatusUpdate,
  } = options;

  console.log("[declarative-swap] Monitoring intent:", signature);

  let attempts = 0;
  let lastResult: MonitorResult | null = null;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await dflowQuoteFetch(
        `/order-status?signature=${signature}`,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "[declarative-swap] Failed to get order status:",
          response.status,
          errorText,
        );

        // Continue polling on transient errors
        if (attempts < maxAttempts) {
          await sleep(pollInterval);
          continue;
        }

        throw new Error(
          `Failed to get order status: ${response.status} - ${errorText}`,
        );
      }

      const statusData = await response.json();

      // Map to our MonitorResult format
      const result: MonitorResult = {
        status: mapOrderStatus(statusData.status),
        fills: parseFills(statusData.fills || []),
        transactionError: statusData.error,
      };

      lastResult = result;

      console.log("[declarative-swap] Order status:", {
        attempt: attempts,
        status: result.status,
        fillsCount: result.fills.length,
      });

      // Notify callback
      if (onStatusUpdate) {
        onStatusUpdate(result);
      }

      // Check terminal states
      switch (result.status) {
        case "closed":
          // Order was filled and closed
          console.log("[declarative-swap] Order closed successfully");
          return result;

        case "pendingClose":
          // Order was filled and is now closable
          console.log("[declarative-swap] Order pending close");
          return result;

        case "openExpired":
          // Transaction to open the order expired
          console.log("[declarative-swap] Open transaction expired");
          return result;

        case "openFailed":
          // Transaction to open the order failed
          console.log("[declarative-swap] Open transaction failed");
          return result;

        case "open":
          // Still processing, continue polling
          await sleep(pollInterval);
          continue;

        default:
          // Unknown status - treat as terminal
          console.warn(
            "[declarative-swap] Unknown order status:",
            result.status,
          );
          return result;
      }
    } catch (error) {
      console.error("[declarative-swap] Error checking order status:", error);

      if (attempts < maxAttempts) {
        await sleep(pollInterval);
        continue;
      }

      throw error;
    }
  }

  // Max attempts reached
  console.warn("[declarative-swap] Max polling attempts reached");
  return (
    lastResult ?? {
      status: "open",
      fills: [],
    }
  );
}

/**
 * Map dflow status string to our OrderStatus type
 */
function mapOrderStatus(status: string): OrderStatus {
  switch (status?.toLowerCase()) {
    case "open":
      return "open";
    case "pendingclose":
    case "pending_close":
      return "pendingClose";
    case "closed":
      return "closed";
    case "openexpired":
    case "open_expired":
      return "openExpired";
    case "openfailed":
    case "open_failed":
      return "openFailed";
    default:
      return "open";
  }
}

/**
 * Parse fills from API response
 */
function parseFills(
  fills: Array<{ qtyIn?: string; qtyOut?: string; txId?: string }>,
): Fill[] {
  return fills.map((f) => ({
    qtyIn: BigInt(f.qtyIn || "0"),
    qtyOut: BigInt(f.qtyOut || "0"),
    txId: f.txId || "",
  }));
}

// ============================================================================
// Full Execution Flow
// ============================================================================

/**
 * Execute a complete declarative swap: request quote, sign, submit, and monitor
 *
 * @param request - Intent request parameters
 * @param signer - KeyPairSigner for signing the transaction
 * @param monitorOptions - Options for monitoring
 * @returns Swap result with final status and fills
 */
export async function executeDeclarativeSwap(
  request: IntentRequest,
  signer: KeyPairSigner,
  monitorOptions?: MonitorOptions,
): Promise<DeclarativeSwapResult> {
  try {
    // Step 1: Request intent quote
    const quoteResponse = await requestIntentQuote(request);

    if (!quoteResponse.openTransaction) {
      return {
        success: false,
        signature: "",
        orderAddress: "",
        status: "openFailed",
        inAmount: quoteResponse.inAmount,
        outAmount: quoteResponse.outAmount,
        minOutAmount: quoteResponse.minOutAmount,
        fills: [],
        error: "No openTransaction returned from intent quote",
      };
    }

    // Step 2: Sign the intent
    const signedOpenTransaction = await signIntentTransaction(
      quoteResponse.openTransaction,
      signer,
    );

    // Step 3: Submit the intent
    const submitResponse = await submitIntent(
      quoteResponse,
      signedOpenTransaction,
    );

    // Step 4: Monitor the intent
    const monitorResult = await monitorIntent(
      submitResponse.openTransactionSignature,
      monitorOptions,
    );

    // Calculate totals from fills
    const totalQtyIn = monitorResult.fills.reduce(
      (acc, f) => acc + f.qtyIn,
      BigInt(0),
    );
    const totalQtyOut = monitorResult.fills.reduce(
      (acc, f) => acc + f.qtyOut,
      BigInt(0),
    );

    const isSuccess =
      monitorResult.status === "closed" ||
      (monitorResult.status === "pendingClose" &&
        monitorResult.fills.length > 0);

    return {
      success: isSuccess,
      signature: submitResponse.openTransactionSignature,
      orderAddress: submitResponse.orderAddress,
      status: monitorResult.status,
      inAmount:
        monitorResult.fills.length > 0
          ? totalQtyIn.toString()
          : quoteResponse.inAmount,
      outAmount:
        monitorResult.fills.length > 0
          ? totalQtyOut.toString()
          : quoteResponse.outAmount,
      minOutAmount: quoteResponse.minOutAmount,
      fills: monitorResult.fills,
      error: isSuccess ? undefined : getErrorMessage(monitorResult),
    };
  } catch (error) {
    console.error("[declarative-swap] Swap execution failed:", error);

    return {
      success: false,
      signature: "",
      orderAddress: "",
      status: "openFailed",
      inAmount: "0",
      outAmount: "0",
      minOutAmount: "0",
      fills: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get appropriate error message based on status
 */
function getErrorMessage(result: MonitorResult): string {
  switch (result.status) {
    case "openExpired":
      return "Transaction expired. Try again with a higher slippage tolerance.";
    case "openFailed":
      return result.transactionError || "Open transaction failed";
    case "open":
      return "Order monitoring timeout - order may still be processing";
    case "pendingClose":
      return result.fills.length === 0 ? "Order was not filled" : "";
    default:
      return "Swap execution failed";
  }
}

// ============================================================================
// Convenience: Execute swap with base58 keys
// ============================================================================

/**
 * Execute declarative swap using a base58-encoded secret key (64 bytes)
 */
export async function executeDeclarativeSwapWithSecretKey(
  request: IntentRequest,
  secretKeyBase58: string,
  monitorOptions?: MonitorOptions,
): Promise<DeclarativeSwapResult> {
  const signer = await createSignerFromBase58SecretKey(secretKeyBase58);
  return executeDeclarativeSwap(request, signer, monitorOptions);
}

/**
 * Execute declarative swap using a base58-encoded private key (32 bytes)
 */
export async function executeDeclarativeSwapWithPrivateKey(
  request: IntentRequest,
  privateKeyBase58: string,
  monitorOptions?: MonitorOptions,
): Promise<DeclarativeSwapResult> {
  const signer = await createSignerFromBase58PrivateKey(privateKeyBase58);
  return executeDeclarativeSwap(request, signer, monitorOptions);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get order status without monitoring loop
 * Useful for one-off status checks
 */
export async function getIntentOrderStatus(
  signature: string,
): Promise<MonitorResult> {
  const response = await dflowQuoteFetch(
    `/order-status?signature=${signature}`,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get order status: ${response.status} - ${errorText}`,
    );
  }

  const statusData = await response.json();

  return {
    status: mapOrderStatus(statusData.status),
    fills: parseFills(statusData.fills || []),
    transactionError: statusData.error,
  };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  createSignerFromBase58SecretKey,
  createSignerFromBase58PrivateKey,
} from "@/lib/solana/wallets";
