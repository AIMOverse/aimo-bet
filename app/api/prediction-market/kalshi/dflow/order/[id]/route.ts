import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/prediction-market/kalshi/dflow/client";

// ============================================================================
// dflow Quote API - Order Status
// Docs: https://pond.dflow.net/swap-api-reference/order/order-status
// ============================================================================

// ============================================================================
// GET /api/dflow/order/[id] - Get order status by transaction signature
// The [id] parameter is the Base58-encoded transaction signature
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: signature } = await params;

    if (!signature) {
      return NextResponse.json(
        { error: "Transaction signature is required" },
        { status: 400 },
      );
    }

    // Get optional lastValidBlockHeight from query params
    const { searchParams } = new URL(req.url);
    const lastValidBlockHeight = searchParams.get("lastValidBlockHeight");

    console.log("[dflow/order/status] Fetching order status:", { signature });

    // Build query string
    const queryParams = new URLSearchParams();
    queryParams.set("signature", signature);

    if (lastValidBlockHeight) {
      queryParams.set("lastValidBlockHeight", lastValidBlockHeight);
    }

    const response = await dflowQuoteFetch(
      `/order-status?${queryParams.toString()}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/order/status] API error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow Quote API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/order/status] Order status:", {
      status: data.status,
      inAmount: data.inAmount,
      outAmount: data.outAmount,
      fillsCount: data.fills?.length ?? 0,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/order/status] Failed to fetch order status:", error);
    return NextResponse.json(
      { error: "Failed to fetch order status" },
      { status: 500 },
    );
  }
}
