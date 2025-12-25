import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Quote API - Imperative Swap
// Docs: https://pond.dflow.net/swap-api-reference/imperative/swap
// ============================================================================

// ============================================================================
// POST /api/dflow/imperative-swap/swap - Create swap transaction from quote
// ============================================================================

interface RoutePlanStep {
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

interface QuoteResponse {
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

interface SwapRequest {
  quoteResponse: QuoteResponse;
  userPublicKey: string; // Base58-encoded wallet address
  computeUnitPriceMicroLamports?: number; // Mutually exclusive with prioritizationFeeLamports
  prioritizationFeeLamports?: number | { autoMultiplier?: number }; // Mutually exclusive with computeUnitPriceMicroLamports
  dynamicComputeUnitLimit?: boolean; // Enable compute unit simulation
  feeAccount?: string; // Platform fee recipient token account
  includeJitoSandwichMitigationAccount?: boolean; // Add Jito sandwich mitigation
  sponsor?: string; // Sponsor wallet for gasless swaps
  wrapAndUnwrapSol?: boolean; // Handle native SOL wrapping
}

interface SwapResponse {
  computeUnitLimit: number;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  swapTransaction: string; // Base64-encoded transaction
  prioritizationType?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SwapRequest;

    // Validate required fields
    if (!body.quoteResponse) {
      return NextResponse.json(
        { error: "quoteResponse is required" },
        { status: 400 },
      );
    }

    if (!body.userPublicKey) {
      return NextResponse.json(
        { error: "userPublicKey is required" },
        { status: 400 },
      );
    }

    // Validate mutual exclusivity
    if (
      body.computeUnitPriceMicroLamports !== undefined &&
      body.prioritizationFeeLamports !== undefined
    ) {
      return NextResponse.json(
        {
          error:
            "computeUnitPriceMicroLamports and prioritizationFeeLamports are mutually exclusive",
        },
        { status: 400 },
      );
    }

    console.log("[dflow/imperative-swap/swap] Creating swap transaction:", {
      userPublicKey: body.userPublicKey,
      inputMint: body.quoteResponse.inputMint,
      outputMint: body.quoteResponse.outputMint,
      inAmount: body.quoteResponse.inAmount,
      outAmount: body.quoteResponse.outAmount,
    });

    const response = await dflowQuoteFetch("/swap", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/imperative-swap/swap] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow Quote API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = (await response.json()) as SwapResponse;
    console.log("[dflow/imperative-swap/swap] Swap transaction created:", {
      computeUnitLimit: data.computeUnitLimit,
      lastValidBlockHeight: data.lastValidBlockHeight,
      prioritizationFeeLamports: data.prioritizationFeeLamports,
      hasTransaction: !!data.swapTransaction,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/imperative-swap/swap] Failed to create swap:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to create imperative swap transaction" },
      { status: 500 },
    );
  }
}
