import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Quote API - Imperative Swap Instructions
// Docs: https://pond.dflow.net/swap-api-reference/imperative/swap-instructions
// ============================================================================

// ============================================================================
// POST /api/dflow/imperative-swap/swap-instructions - Get swap instructions
// Returns individual instructions instead of a complete transaction
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

interface SwapInstructionsRequest {
  quoteResponse: QuoteResponse;
  userPublicKey: string; // Base58-encoded wallet address
  computeUnitPriceMicroLamports?: number; // Mutually exclusive with prioritizationFeeLamports
  prioritizationFeeLamports?: number | { autoMultiplier?: number }; // Mutually exclusive with computeUnitPriceMicroLamports
  dynamicComputeUnitLimit?: boolean; // Enable compute unit simulation
  feeAccount?: string; // Platform fee recipient token account
  includeJitoSandwichMitigationAccount?: boolean; // Add Jito sandwich mitigation
  wrapAndUnwrapSol?: boolean; // Handle native SOL wrapping
  createFeeAccount?: {
    referralAccount: string;
    referralMint: string;
  }; // Referral account configuration
  destinationTokenAccount?: {
    address: string;
    createIfNeeded: boolean;
  }; // Output token destination
  positiveSlippage?: {
    mode: "feeAccount" | "userAccount";
    feeAccount?: string;
  }; // Capture excess slippage
  sponsor?: string; // Gasless swap sponsor address
}

interface Instruction {
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string;
  programId: string;
}

interface SwapInstructionsResponse {
  addressLookupTableAddresses: string[];
  blockhashWithMetadata: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
  setupInstructions: Instruction[];
  swapInstruction: Instruction;
  cleanupInstructions: Instruction[];
  computeBudgetInstructions: Instruction[];
  otherInstructions: Instruction[];
  computeUnitLimit: number;
  prioritizationFeeLamports: number;
  prioritizationType?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SwapInstructionsRequest;

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

    console.log(
      "[dflow/imperative-swap/swap-instructions] Getting swap instructions:",
      {
        userPublicKey: body.userPublicKey,
        inputMint: body.quoteResponse.inputMint,
        outputMint: body.quoteResponse.outputMint,
        inAmount: body.quoteResponse.inAmount,
        outAmount: body.quoteResponse.outAmount,
      },
    );

    const response = await dflowQuoteFetch("/swap-instructions", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/imperative-swap/swap-instructions] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow Quote API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = (await response.json()) as SwapInstructionsResponse;
    console.log(
      "[dflow/imperative-swap/swap-instructions] Instructions received:",
      {
        setupInstructionsCount: data.setupInstructions?.length ?? 0,
        hasSwapInstruction: !!data.swapInstruction,
        cleanupInstructionsCount: data.cleanupInstructions?.length ?? 0,
        computeBudgetInstructionsCount:
          data.computeBudgetInstructions?.length ?? 0,
        computeUnitLimit: data.computeUnitLimit,
        addressLookupTablesCount: data.addressLookupTableAddresses?.length ?? 0,
      },
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/imperative-swap/swap-instructions] Failed to get instructions:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to get imperative swap instructions" },
      { status: 500 },
    );
  }
}
