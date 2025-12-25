import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Quote API - Submit Declarative Intent Swap
// Docs: https://pond.dflow.net/swap-api-reference/declarative/submit
// ============================================================================

// ============================================================================
// POST /api/dflow/declarative-swap/submit - Submit signed intent transaction
// ============================================================================

interface IntentQuoteResponse {
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

interface SubmitIntentRequest {
  quoteResponse: IntentQuoteResponse;
  signedOpenTransaction: string; // Base64-encoded signed transaction
}

interface SubmitIntentResponse {
  openTransactionSignature: string; // Base58-encoded signature
  orderAddress: string; // Base58-encoded order address
  programId: string; // Base58-encoded program ID
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SubmitIntentRequest;

    // Validate required fields
    if (!body.quoteResponse) {
      return NextResponse.json(
        { error: "quoteResponse is required" },
        { status: 400 },
      );
    }

    if (!body.signedOpenTransaction) {
      return NextResponse.json(
        { error: "signedOpenTransaction is required" },
        { status: 400 },
      );
    }

    // Validate quoteResponse has required fields
    if (!body.quoteResponse.openTransaction) {
      return NextResponse.json(
        { error: "quoteResponse.openTransaction is required" },
        { status: 400 },
      );
    }

    console.log("[dflow/declarative-swap/submit] Submitting intent:", {
      inputMint: body.quoteResponse.inputMint,
      outputMint: body.quoteResponse.outputMint,
      inAmount: body.quoteResponse.inAmount,
      outAmount: body.quoteResponse.outAmount,
      minOutAmount: body.quoteResponse.minOutAmount,
      slippageBps: body.quoteResponse.slippageBps,
    });

    const response = await dflowQuoteFetch("/submit-intent", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/declarative-swap/submit] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow Submit Intent API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = (await response.json()) as SubmitIntentResponse;
    console.log("[dflow/declarative-swap/submit] Intent submitted:", {
      openTransactionSignature: data.openTransactionSignature,
      orderAddress: data.orderAddress,
      programId: data.programId,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/declarative-swap/submit] Failed to submit intent:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to submit declarative intent swap" },
      { status: 500 },
    );
  }
}
