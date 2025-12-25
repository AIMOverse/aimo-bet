import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Quote API - Declarative Intent Quote
// Docs: https://pond.dflow.net/swap-api-reference/declarative/quote
// ============================================================================

// ============================================================================
// GET /api/dflow/declarative-swap/quote - Get quote for a declarative intent swap
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Required parameters
    const inputMint = searchParams.get("inputMint");
    const outputMint = searchParams.get("outputMint");
    const amount = searchParams.get("amount");
    const slippageBps = searchParams.get("slippageBps");

    if (!inputMint || !outputMint || !amount || !slippageBps) {
      return NextResponse.json(
        {
          error:
            "inputMint, outputMint, amount, and slippageBps are required",
        },
        { status: 400 },
      );
    }

    // Build query string with all parameters
    const queryParams = new URLSearchParams();
    queryParams.set("inputMint", inputMint);
    queryParams.set("outputMint", outputMint);
    queryParams.set("amount", amount);
    queryParams.set("slippageBps", slippageBps);

    // Optional parameters
    const optionalParams = [
      "userPublicKey",
      "platformFeeBps",
      "feeAccount",
      "referralAccount",
      "wrapAndUnwrapSol",
      "feeBudget",
      "maxAutoFeeBudget",
    ];

    for (const param of optionalParams) {
      const value = searchParams.get(param);
      if (value !== null) {
        queryParams.set(param, value);
      }
    }

    console.log("[dflow/declarative-swap/quote] Getting intent quote:", {
      inputMint,
      outputMint,
      amount,
      slippageBps,
    });

    const response = await dflowQuoteFetch(`/intent?${queryParams.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/declarative-swap/quote] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow Intent API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = (await response.json()) as IntentQuoteResponse;
    console.log("[dflow/declarative-swap/quote] Intent quote response:", {
      inAmount: data.inAmount,
      outAmount: data.outAmount,
      minOutAmount: data.minOutAmount,
      priceImpactPct: data.priceImpactPct,
      feeBudget: data.feeBudget,
      slippageBps: data.slippageBps,
      lastValidBlockHeight: data.lastValidBlockHeight,
      hasOpenTransaction: !!data.openTransaction,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/declarative-swap/quote] Failed to get intent quote:", error);
    return NextResponse.json(
      { error: "Failed to get declarative intent quote" },
      { status: 500 },
    );
  }
}
