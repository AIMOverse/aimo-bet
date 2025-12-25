import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Quote API - Order
// Docs: https://pond.dflow.net/swap-api-reference/order/order
// ============================================================================

// ============================================================================
// GET /api/dflow/order - Get order quote and transaction
// ============================================================================

interface OrderQueryParams {
  inputMint: string; // Base58-encoded input token mint address
  outputMint: string; // Base58-encoded output token mint address
  amount: number; // Input amount as scaled integer (e.g., 1 SOL = 1000000000)
  userPublicKey?: string; // Wallet address - if provided, generates a transaction
  slippageBps?: number | "auto"; // Max slippage in basis points
  predictionMarketSlippageBps?: number | "auto"; // Prediction market slippage tolerance
  dexes?: string; // Comma-separated DEX inclusion list
  excludeDexes?: string; // Comma-separated DEX exclusion list
  onlyDirectRoutes?: boolean; // Single-leg routes only
  maxRouteLength?: number; // Maximum route legs
  platformFeeBps?: number; // Platform fee in basis points
  feeAccount?: string; // Recipient token account for platform fees
  destinationTokenAccount?: string; // Output token destination
  prioritizationFeeLamports?:
    | number
    | "auto"
    | "medium"
    | "high"
    | "veryHigh"
    | "disabled";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Required parameters
    const inputMint = searchParams.get("inputMint");
    const outputMint = searchParams.get("outputMint");
    const amount = searchParams.get("amount");

    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json(
        { error: "inputMint, outputMint, and amount are required" },
        { status: 400 },
      );
    }

    // Build query string with all parameters
    const queryParams = new URLSearchParams();
    queryParams.set("inputMint", inputMint);
    queryParams.set("outputMint", outputMint);
    queryParams.set("amount", amount);

    // Optional parameters
    const optionalParams = [
      "userPublicKey",
      "slippageBps",
      "predictionMarketSlippageBps",
      "dexes",
      "excludeDexes",
      "onlyDirectRoutes",
      "maxRouteLength",
      "platformFeeBps",
      "feeAccount",
      "destinationTokenAccount",
      "prioritizationFeeLamports",
    ];

    for (const param of optionalParams) {
      const value = searchParams.get(param);
      if (value !== null) {
        queryParams.set(param, value);
      }
    }

    console.log("[dflow/order] Getting order quote:", {
      inputMint,
      outputMint,
      amount,
      userPublicKey: searchParams.get("userPublicKey"),
    });

    const response = await dflowQuoteFetch(`/order?${queryParams.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/order] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow Quote API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/order] Order quote response:", {
      inAmount: data.inAmount,
      outAmount: data.outAmount,
      executionMode: data.executionMode,
      hasTransaction: !!data.transaction,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/order] Failed to get order quote:", error);
    return NextResponse.json(
      { error: "Failed to get order quote" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST /api/dflow/order - Convenience endpoint to get order with body params
// Converts body params to query params and calls the dflow API
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as OrderQueryParams;
    const { inputMint, outputMint, amount, userPublicKey, ...optionalParams } =
      body;

    // Validate required fields
    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json(
        { error: "inputMint, outputMint, and amount are required" },
        { status: 400 },
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: "amount must be positive" },
        { status: 400 },
      );
    }

    // Build query string
    const queryParams = new URLSearchParams();
    queryParams.set("inputMint", inputMint);
    queryParams.set("outputMint", outputMint);
    queryParams.set("amount", amount.toString());

    if (userPublicKey) {
      queryParams.set("userPublicKey", userPublicKey);
    }

    // Add optional parameters
    for (const [key, value] of Object.entries(optionalParams)) {
      if (value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    }

    console.log("[dflow/order] Getting order quote (POST):", {
      inputMint,
      outputMint,
      amount,
      userPublicKey,
    });

    const response = await dflowQuoteFetch(`/order?${queryParams.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/order] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow Quote API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/order] Order quote response:", {
      inAmount: data.inAmount,
      outAmount: data.outAmount,
      executionMode: data.executionMode,
      hasTransaction: !!data.transaction,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/order] Failed to get order quote:", error);
    return NextResponse.json(
      { error: "Failed to get order quote" },
      { status: 500 },
    );
  }
}
