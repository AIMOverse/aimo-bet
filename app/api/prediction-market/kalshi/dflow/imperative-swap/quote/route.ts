import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Quote API - Imperative Quote
// Docs: https://pond.dflow.net/swap-api-reference/imperative/quote
// ============================================================================

// ============================================================================
// GET /api/dflow/imperative-swap/quote - Get quote for an imperative swap
// ============================================================================

interface QuoteQueryParams {
  inputMint: string; // Base58-encoded input mint address
  outputMint: string; // Base58-encoded output mint address
  amount: number; // Input amount as scaled integer (e.g., 1 SOL = 1000000000)
  slippageBps: number | "auto"; // Max slippage in basis points or "auto"
  dexes?: string; // Comma-separated DEX inclusion list
  excludeDexes?: string; // Comma-separated DEX exclusion list
  platformFeeBps?: number; // Platform fee in basis points
  platformFeeMode?: "outputMint" | "inputMint"; // Fee mode (default: outputMint)
  sponsoredSwap?: boolean; // Account for transfer fees
  destinationSwap?: boolean; // Account for destination token account fees
  onlyDirectRoutes?: boolean; // Single-leg routes only
  maxRouteLength?: number; // Limit route legs
  onlyJitRoutes?: boolean; // Use JIT router exclusively
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
      "dexes",
      "excludeDexes",
      "platformFeeBps",
      "platformFeeMode",
      "sponsoredSwap",
      "destinationSwap",
      "onlyDirectRoutes",
      "maxRouteLength",
      "onlyJitRoutes",
    ];

    for (const param of optionalParams) {
      const value = searchParams.get(param);
      if (value !== null) {
        queryParams.set(param, value);
      }
    }

    console.log("[dflow/imperative-swap/quote] Getting quote:", {
      inputMint,
      outputMint,
      amount,
      slippageBps,
    });

    const response = await dflowQuoteFetch(`/quote?${queryParams.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/imperative-swap/quote] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow Quote API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/imperative-swap/quote] Quote response:", {
      inAmount: data.inAmount,
      outAmount: data.outAmount,
      minOutAmount: data.minOutAmount,
      priceImpactPct: data.priceImpactPct,
      routePlanLength: data.routePlan?.length ?? 0,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/imperative-swap/quote] Failed to get quote:", error);
    return NextResponse.json(
      { error: "Failed to get imperative swap quote" },
      { status: 500 },
    );
  }
}
