// ============================================================================
// dflow Imperative Swap Execution
// High-level imperative swap execution with transaction signing and submission
// Docs: https://pond.dflow.net/quickstart/swap-tokens
// ============================================================================

import { type KeyPairSigner } from "@solana/kit";
import { dflowQuoteFetch } from "@/lib/dflow/client";
import {
  createSignerFromBase58SecretKey,
  createSignerFromBase58PrivateKey,
} from "@/lib/solana/signer";
import {
  signAndSubmitTransaction,
  monitorTransactionConfirmation,
  getTransactionStatus as getSolanaTransactionStatus,
  type MonitorOptions as SolanaMonitorOptions,
  type ConfirmationResult,
} from "@/lib/solana/transaction";

// ============================================================================
// Types
// ============================================================================

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: number; // Scaled integer (e.g., 1 SOL = 1_000_000_000)
  slippageBps: number | "auto";
  dexes?: string; // Comma-separated DEX inclusion list
  excludeDexes?: string; // Comma-separated DEX exclusion list
  platformFeeBps?: number;
  platformFeeMode?: "outputMint" | "inputMint";
  sponsoredSwap?: boolean;
  destinationSwap?: boolean;
  onlyDirectRoutes?: boolean;
  maxRouteLength?: number;
  onlyJitRoutes?: boolean;
}

export interface RoutePlanStep {
  data: string;
  inAmount: string;
  inputMint: string;
  inputMintDecimals: number;
  marketKey: string;
  outAmount: string;
  outputMint: string;
  outputMintDecimals: number;
  venue: string;
}

export interface QuoteResponse {
  contextSlot: number;
  inAmount: string;
  inputMint: string;
  minOutAmount: string;
  otherAmountThreshold?: string;
  outAmount: string;
  outputMint: string;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  slippageBps: number;
  outTransferFee?: string;
  platformFee?: unknown;
  requestId?: string;
  simulatedComputeUnits?: number;
}

export interface SwapRequest {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
  computeUnitPriceMicroLamports?: number;
  prioritizationFeeLamports?: number | { autoMultiplier?: number };
  dynamicComputeUnitLimit?: boolean;
  feeAccount?: string;
  includeJitoSandwichMitigationAccount?: boolean;
  sponsor?: string;
  wrapAndUnwrapSol?: boolean;
}

export interface SwapResponse {
  computeUnitLimit: number;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  swapTransaction: string; // Base64-encoded transaction
  prioritizationType?: unknown;
}

export interface ImperativeSwapResult {
  success: boolean;
  signature: string;
  inAmount: string;
  outAmount: string;
  minOutAmount: string;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  slot?: bigint;
  confirmationStatus?: "processed" | "confirmed" | "finalized";
  error?: string;
}

export interface MonitorOptions {
  /** Polling interval in ms (default: 1000) */
  pollInterval?: number;
  /** Maximum polling attempts (default: 30) */
  maxAttempts?: number;
}

// ============================================================================
// Step 1: Request a Quote
// ============================================================================

/**
 * Request a quote from dflow Quote API
 * Returns route and pricing information for the swap
 */
export async function requestQuote(
  request: QuoteRequest,
): Promise<QuoteResponse> {
  const queryParams = new URLSearchParams();
  queryParams.set("inputMint", request.inputMint);
  queryParams.set("outputMint", request.outputMint);
  queryParams.set("amount", request.amount.toString());
  queryParams.set("slippageBps", request.slippageBps.toString());

  // Optional parameters
  if (request.dexes !== undefined) {
    queryParams.set("dexes", request.dexes);
  }
  if (request.excludeDexes !== undefined) {
    queryParams.set("excludeDexes", request.excludeDexes);
  }
  if (request.platformFeeBps !== undefined) {
    queryParams.set("platformFeeBps", request.platformFeeBps.toString());
  }
  if (request.platformFeeMode !== undefined) {
    queryParams.set("platformFeeMode", request.platformFeeMode);
  }
  if (request.sponsoredSwap !== undefined) {
    queryParams.set("sponsoredSwap", request.sponsoredSwap.toString());
  }
  if (request.destinationSwap !== undefined) {
    queryParams.set("destinationSwap", request.destinationSwap.toString());
  }
  if (request.onlyDirectRoutes !== undefined) {
    queryParams.set("onlyDirectRoutes", request.onlyDirectRoutes.toString());
  }
  if (request.maxRouteLength !== undefined) {
    queryParams.set("maxRouteLength", request.maxRouteLength.toString());
  }
  if (request.onlyJitRoutes !== undefined) {
    queryParams.set("onlyJitRoutes", request.onlyJitRoutes.toString());
  }

  console.log("[imperative-swap] Requesting quote:", {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: request.amount,
    slippageBps: request.slippageBps,
  });

  const response = await dflowQuoteFetch(`/quote?${queryParams.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to request quote: ${response.status} - ${errorText}`,
    );
  }

  const data = (await response.json()) as QuoteResponse;

  console.log("[imperative-swap] Quote response:", {
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    minOutAmount: data.minOutAmount,
    priceImpactPct: data.priceImpactPct,
    routePlanLength: data.routePlan?.length ?? 0,
  });

  return data;
}

// ============================================================================
// Step 2: Request Swap Transaction
// ============================================================================

/**
 * Request a swap transaction from dflow Quote API
 * Given a quote, returns an executable transaction
 */
export async function requestSwapTransaction(
  request: SwapRequest,
): Promise<SwapResponse> {
  console.log("[imperative-swap] Requesting swap transaction:", {
    userPublicKey: request.userPublicKey,
    inputMint: request.quoteResponse.inputMint,
    outputMint: request.quoteResponse.outputMint,
    inAmount: request.quoteResponse.inAmount,
    outAmount: request.quoteResponse.outAmount,
  });

  const response = await dflowQuoteFetch("/swap", {
    method: "POST",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to request swap transaction: ${response.status} - ${errorText}`,
    );
  }

  const data = (await response.json()) as SwapResponse;

  console.log("[imperative-swap] Swap transaction created:", {
    computeUnitLimit: data.computeUnitLimit,
    lastValidBlockHeight: data.lastValidBlockHeight,
    prioritizationFeeLamports: data.prioritizationFeeLamports,
    hasTransaction: !!data.swapTransaction,
  });

  return data;
}

// ============================================================================
// Step 3: Sign and Submit Transaction
// ============================================================================

/**
 * Sign and submit a swap transaction to Solana
 * @param swapTransactionBase64 - Base64-encoded transaction from dflow
 * @param signer - KeyPairSigner to sign with
 * @returns Transaction signature (base58)
 */
export async function signAndSubmitSwapTransaction(
  swapTransactionBase64: string,
  signer: KeyPairSigner,
): Promise<string> {
  const signature = await signAndSubmitTransaction(
    swapTransactionBase64,
    signer,
  );

  console.log("[imperative-swap] Transaction submitted:", signature);

  return signature;
}

// ============================================================================
// Monitor Transaction Confirmation
// ============================================================================

/**
 * Monitor transaction until confirmation using RPC getSignatureStatuses
 */
export async function monitorTransaction(
  signatureStr: string,
  options: MonitorOptions = {},
): Promise<ConfirmationResult> {
  console.log("[imperative-swap] Monitoring transaction:", signatureStr);

  const result = await monitorTransactionConfirmation(signatureStr, options);

  if (result.success) {
    console.log(
      `[imperative-swap] Transaction confirmed in slot ${result.slot}`,
    );
  } else {
    console.error("[imperative-swap] Transaction failed:", result.error);
  }

  return result;
}

// ============================================================================
// Full Execution Flow
// ============================================================================

export interface ExecuteSwapOptions {
  /** User's public key (wallet address) */
  userPublicKey: string;
  /** Priority fee in lamports (default: 150000) */
  prioritizationFeeLamports?: number;
  /** Enable dynamic compute unit limit */
  dynamicComputeUnitLimit?: boolean;
  /** Handle native SOL wrapping/unwrapping */
  wrapAndUnwrapSol?: boolean;
  /** Monitoring options */
  monitorOptions?: MonitorOptions;
}

/**
 * Execute a complete imperative swap: request quote, get transaction, sign, submit, and monitor
 *
 * @param quoteRequest - Quote request parameters
 * @param signer - KeyPairSigner for signing the transaction
 * @param options - Swap execution options
 * @returns Swap result with final status
 */
export async function executeImperativeSwap(
  quoteRequest: QuoteRequest,
  signer: KeyPairSigner,
  options: ExecuteSwapOptions,
): Promise<ImperativeSwapResult> {
  try {
    // Step 1: Request quote
    const quoteResponse = await requestQuote(quoteRequest);

    if (!quoteResponse.routePlan || quoteResponse.routePlan.length === 0) {
      return {
        success: false,
        signature: "",
        inAmount: quoteResponse.inAmount,
        outAmount: quoteResponse.outAmount,
        minOutAmount: quoteResponse.minOutAmount,
        priceImpactPct: quoteResponse.priceImpactPct,
        routePlan: [],
        error: "No route found for swap",
      };
    }

    // Step 2: Request swap transaction
    const swapResponse = await requestSwapTransaction({
      quoteResponse,
      userPublicKey: options.userPublicKey,
      prioritizationFeeLamports: options.prioritizationFeeLamports ?? 150000,
      dynamicComputeUnitLimit: options.dynamicComputeUnitLimit ?? true,
      wrapAndUnwrapSol: options.wrapAndUnwrapSol ?? true,
    });

    if (!swapResponse.swapTransaction) {
      return {
        success: false,
        signature: "",
        inAmount: quoteResponse.inAmount,
        outAmount: quoteResponse.outAmount,
        minOutAmount: quoteResponse.minOutAmount,
        priceImpactPct: quoteResponse.priceImpactPct,
        routePlan: quoteResponse.routePlan,
        error: "No swap transaction returned",
      };
    }

    // Step 3: Sign and submit transaction
    const signature = await signAndSubmitSwapTransaction(
      swapResponse.swapTransaction,
      signer,
    );

    // Step 4: Monitor transaction confirmation
    const confirmationResult = await monitorTransaction(
      signature,
      options.monitorOptions,
    );

    return {
      success: confirmationResult.success,
      signature,
      inAmount: quoteResponse.inAmount,
      outAmount: quoteResponse.outAmount,
      minOutAmount: quoteResponse.minOutAmount,
      priceImpactPct: quoteResponse.priceImpactPct,
      routePlan: quoteResponse.routePlan,
      slot: confirmationResult.slot,
      confirmationStatus: confirmationResult.confirmationStatus,
      error: confirmationResult.error,
    };
  } catch (error) {
    console.error("[imperative-swap] Swap execution failed:", error);

    return {
      success: false,
      signature: "",
      inAmount: "0",
      outAmount: "0",
      minOutAmount: "0",
      priceImpactPct: "0",
      routePlan: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Convenience: Execute swap with base58 keys
// ============================================================================

/**
 * Execute imperative swap using a base58-encoded secret key (64 bytes)
 */
export async function executeImperativeSwapWithSecretKey(
  quoteRequest: QuoteRequest,
  secretKeyBase58: string,
  options: ExecuteSwapOptions,
): Promise<ImperativeSwapResult> {
  const signer = await createSignerFromBase58SecretKey(secretKeyBase58);
  return executeImperativeSwap(quoteRequest, signer, options);
}

/**
 * Execute imperative swap using a base58-encoded private key (32 bytes)
 */
export async function executeImperativeSwapWithPrivateKey(
  quoteRequest: QuoteRequest,
  privateKeyBase58: string,
  options: ExecuteSwapOptions,
): Promise<ImperativeSwapResult> {
  const signer = await createSignerFromBase58PrivateKey(privateKeyBase58);
  return executeImperativeSwap(quoteRequest, signer, options);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get transaction status without monitoring loop
 * Useful for one-off status checks
 */
export async function getTransactionStatus(
  signatureStr: string,
): Promise<ConfirmationResult> {
  return getSolanaTransactionStatus(signatureStr);
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  createSignerFromBase58SecretKey,
  createSignerFromBase58PrivateKey,
} from "@/lib/solana/signer";

export type { ConfirmationResult } from "@/lib/solana/transaction";
