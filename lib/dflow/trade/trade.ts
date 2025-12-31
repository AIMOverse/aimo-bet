// ============================================================================
// dflow Trade Execution
// High-level trade execution with transaction signing and async monitoring
// Docs: https://pond.dflow.net/quickstart/trade-tokens
// ============================================================================

import { type KeyPairSigner } from "@solana/kit";
import { dflowQuoteFetch } from "@/lib/dflow/client";
import { sleep } from "@/lib/dflow/utils";
import { getRpc } from "@/lib/solana/client";
import {
  createSignerFromBase58SecretKey,
  createSignerFromBase58PrivateKey,
} from "@/lib/solana/signer";
import {
  signAndSubmitTransaction,
  monitorTransactionConfirmation,
  type MonitorOptions as SolanaMonitorOptions,
} from "@/lib/solana/transaction";

// ============================================================================
// Types
// ============================================================================

export interface OrderRequest {
  inputMint: string;
  outputMint: string;
  amount: number; // Scaled integer (e.g., 1 SOL = 1_000_000_000)
  userPublicKey: string;
  slippageBps?: number | "auto";
  predictionMarketSlippageBps?: number | "auto";
  prioritizationFeeLamports?:
    | number
    | "auto"
    | "medium"
    | "high"
    | "veryHigh"
    | "disabled";
}

export interface OrderResponse {
  inAmount: string;
  outAmount: string;
  inputMint: string;
  outputMint: string;
  transaction: string; // Base64-encoded transaction
  lastValidBlockHeight: number;
  executionMode: "sync" | "async";
  routePlan: RouteLeg[];
}

export interface RouteLeg {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  venue: string;
}

export interface OrderStatus {
  status: "open" | "pendingClose" | "closed" | "failed";
  inAmount: string;
  outAmount: string;
  fills: Fill[];
}

export interface Fill {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  venue: string;
  txId: string;
}

export interface TradeResult {
  success: boolean;
  signature: string;
  status: OrderStatus["status"];
  inAmount: string;
  outAmount: string;
  fills: Fill[];
  executionMode: "sync" | "async";
  error?: string;
}

export interface MonitorOptions {
  /** Polling interval in ms (default: 2000 for async, 1000 for sync) */
  pollInterval?: number;
  /** Maximum polling attempts (default: 30) */
  maxAttempts?: number;
  /** Callback for status updates (async trades only) */
  onStatusUpdate?: (status: OrderStatus) => void;
}

export interface SyncTradeResult {
  success: boolean;
  signature: string;
  slot?: bigint;
  confirmationStatus?: "processed" | "confirmed" | "finalized";
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_MAX_ATTEMPTS = 30;

// ============================================================================
// requestOrder - Get quote and transaction from dflow
// ============================================================================

/**
 * Request an order quote and transaction from dflow Quote API
 */
export async function requestOrder(
  request: OrderRequest,
): Promise<OrderResponse> {
  const queryParams = new URLSearchParams();
  queryParams.set("inputMint", request.inputMint);
  queryParams.set("outputMint", request.outputMint);
  queryParams.set("amount", request.amount.toString());
  queryParams.set("userPublicKey", request.userPublicKey);

  if (request.slippageBps !== undefined) {
    queryParams.set("slippageBps", request.slippageBps.toString());
  }
  if (request.predictionMarketSlippageBps !== undefined) {
    queryParams.set(
      "predictionMarketSlippageBps",
      request.predictionMarketSlippageBps.toString(),
    );
  }
  if (request.prioritizationFeeLamports !== undefined) {
    queryParams.set(
      "prioritizationFeeLamports",
      request.prioritizationFeeLamports.toString(),
    );
  }

  console.log("[trade] Requesting order:", {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: request.amount,
    userPublicKey: request.userPublicKey,
  });

  const response = await dflowQuoteFetch(`/order?${queryParams.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to request order: ${response.status} - ${errorText}`,
    );
  }

  const data = await response.json();

  console.log("[trade] Order response:", {
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    executionMode: data.executionMode,
    hasTransaction: !!data.transaction,
  });

  return data as OrderResponse;
}

// ============================================================================
// monitorSyncTrade - Monitor sync trade using RPC getSignatureStatuses
// ============================================================================

/**
 * Monitor a sync trade until confirmation using RPC getSignatureStatuses
 * Sync trades execute atomically in a single transaction
 */
export async function monitorSyncTrade(
  signatureStr: string,
  options: MonitorOptions = {},
): Promise<SyncTradeResult> {
  const { pollInterval = 1000, maxAttempts = DEFAULT_MAX_ATTEMPTS } = options;

  console.log("[trade] Monitoring sync trade:", signatureStr);

  const result = await monitorTransactionConfirmation(signatureStr, {
    pollInterval,
    maxAttempts,
  });

  if (result.success) {
    console.log(`[trade] Trade completed successfully in slot ${result.slot}`);
  } else {
    console.error("[trade] Transaction failed:", result.error);
  }

  return {
    success: result.success,
    signature: signatureStr,
    slot: result.slot,
    confirmationStatus: result.confirmationStatus,
    error: result.error,
  };
}

// ============================================================================
// monitorAsyncTrade - Poll order status for async trades
// ============================================================================

/**
 * Monitor an async trade until completion
 * Polls the order-status endpoint until the order is closed or failed
 */
export async function monitorAsyncTrade(
  signature: string,
  options: MonitorOptions = {},
): Promise<OrderStatus> {
  const {
    pollInterval = DEFAULT_POLL_INTERVAL,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    onStatusUpdate,
  } = options;

  console.log("[trade] Monitoring async trade:", signature);

  let attempts = 0;
  let lastStatus: OrderStatus | null = null;

  while (attempts < maxAttempts) {
    attempts++;

    const response = await dflowQuoteFetch(
      `/order-status?signature=${signature}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[trade] Failed to get order status:",
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

    const statusData: OrderStatus = await response.json();
    lastStatus = statusData;

    console.log("[trade] Order status:", {
      attempt: attempts,
      status: statusData.status,
      fillsCount: statusData.fills?.length ?? 0,
    });

    // Notify callback
    if (onStatusUpdate) {
      onStatusUpdate(statusData);
    }

    // Check terminal states
    if (statusData.status === "closed" || statusData.status === "failed") {
      return statusData;
    }

    // Continue polling for open or pendingClose
    if (statusData.status === "open" || statusData.status === "pendingClose") {
      await sleep(pollInterval);
      continue;
    }

    // Unknown status - treat as terminal
    console.warn("[trade] Unknown order status:", statusData.status);
    return statusData;
  }

  // Max attempts reached
  console.warn("[trade] Max polling attempts reached");
  return (
    lastStatus ?? {
      status: "failed",
      inAmount: "0",
      outAmount: "0",
      fills: [],
    }
  );
}

// ============================================================================
// executeTrade - Full trade execution flow
// ============================================================================

/**
 * Execute a complete trade: request order, sign, submit, and monitor
 *
 * @param request - Order parameters
 * @param signer - KeyPairSigner for signing the transaction
 * @param monitorOptions - Options for async trade monitoring
 * @returns Trade result with final status and fills
 */
export async function executeTrade(
  request: OrderRequest,
  signer: KeyPairSigner,
  monitorOptions?: MonitorOptions,
): Promise<TradeResult> {
  try {
    // Step 1: Request order quote and transaction
    const orderResponse = await requestOrder(request);

    if (!orderResponse.transaction) {
      return {
        success: false,
        signature: "",
        status: "failed",
        inAmount: orderResponse.inAmount,
        outAmount: orderResponse.outAmount,
        fills: [],
        executionMode: orderResponse.executionMode,
        error: "No transaction returned from order request",
      };
    }

    // Step 2: Sign and submit transaction
    const signature = await signAndSubmitTransaction(
      orderResponse.transaction,
      signer,
    );

    console.log("[trade] Transaction submitted:", signature);

    // Step 3: Handle based on execution mode
    if (orderResponse.executionMode === "sync") {
      // Sync mode: monitor using RPC getSignatureStatuses
      console.log("[trade] Sync trade submitted, monitoring confirmation...");

      const syncResult = await monitorSyncTrade(signature, monitorOptions);

      return {
        success: syncResult.success,
        signature,
        status: syncResult.success ? "closed" : "failed",
        inAmount: orderResponse.inAmount,
        outAmount: orderResponse.outAmount,
        fills: [],
        executionMode: "sync",
        error: syncResult.error,
      };
    }

    // Step 4: Async mode - monitor until completion
    console.log("[trade] Async trade started, monitoring...");

    const finalStatus = await monitorAsyncTrade(signature, monitorOptions);

    return {
      success: finalStatus.status === "closed",
      signature,
      status: finalStatus.status,
      inAmount: finalStatus.inAmount || orderResponse.inAmount,
      outAmount: finalStatus.outAmount || orderResponse.outAmount,
      fills: finalStatus.fills || [],
      executionMode: "async",
      error:
        finalStatus.status === "failed" ? "Order execution failed" : undefined,
    };
  } catch (error) {
    console.error("[trade] Trade execution failed:", error);

    return {
      success: false,
      signature: "",
      status: "failed",
      inAmount: "0",
      outAmount: "0",
      fills: [],
      executionMode: "sync",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Convenience: Execute trade with base58 secret key
// ============================================================================

/**
 * Execute trade using a base58-encoded secret key (64 bytes)
 * Convenience wrapper that creates the signer for you
 */
export async function executeTradeWithSecretKey(
  request: OrderRequest,
  secretKeyBase58: string,
  monitorOptions?: MonitorOptions,
): Promise<TradeResult> {
  const signer = await createSignerFromBase58SecretKey(secretKeyBase58);
  return executeTrade(request, signer, monitorOptions);
}

/**
 * Execute trade using a base58-encoded private key (32 bytes)
 * Convenience wrapper that creates the signer for you
 */
export async function executeTradeWithPrivateKey(
  request: OrderRequest,
  privateKeyBase58: string,
  monitorOptions?: MonitorOptions,
): Promise<TradeResult> {
  const signer = await createSignerFromBase58PrivateKey(privateKeyBase58);
  return executeTrade(request, signer, monitorOptions);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get order status without monitoring loop
 * Useful for one-off status checks
 */
export async function getOrderStatus(signature: string): Promise<OrderStatus> {
  const response = await dflowQuoteFetch(
    `/order-status?signature=${signature}`,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get order status: ${response.status} - ${errorText}`,
    );
  }

  return response.json();
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  createSignerFromBase58SecretKey,
  createSignerFromBase58PrivateKey,
} from "@/lib/solana/signer";

export {
  createSignerFromSecretKeyBytes,
  createSignerFromPrivateKeyBytes,
} from "@/lib/solana/signer";
