import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Prediction Market Initialization API
// Docs: https://pond.dflow.net/swap-api-reference/prediction-market/prediction-market-init
// ============================================================================

// ============================================================================
// GET /api/dflow/prediction-market-util - Get transaction to initialize a prediction market
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const payer = searchParams.get("payer");
    const outcomeMint = searchParams.get("outcomeMint");

    console.log("[dflow/prediction-market-util] Init request:", {
      payer,
      outcomeMint,
    });

    // Validate required parameters
    if (!payer) {
      return NextResponse.json(
        { error: "payer is required (Base58-encoded address)" },
        { status: 400 },
      );
    }

    if (!outcomeMint) {
      return NextResponse.json(
        { error: "outcomeMint is required (Base58-encoded mint address)" },
        { status: 400 },
      );
    }

    // Build query params for dflow API
    const params = new URLSearchParams();
    params.set("payer", payer);
    params.set("outcomeMint", outcomeMint);

    const response = await dflowQuoteFetch(`/prediction-market-init?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/prediction-market-util] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}`, details: errorText },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log(
      "[dflow/prediction-market-util] Transaction generated successfully",
    );

    // Response format:
    // {
    //   computeUnitLimit: number,
    //   lastValidBlockHeight: number,
    //   transaction: string (base64-encoded)
    // }
    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "[dflow/prediction-market-util] Failed to initialize market:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to initialize prediction market" },
      { status: 500 },
    );
  }
}
