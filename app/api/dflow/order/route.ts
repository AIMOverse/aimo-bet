import { NextResponse } from "next/server";
import { dflowSwapFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Swap API - Order
// Docs: https://pond.dflow.net/swap-api-reference/order/order
// ============================================================================

// ============================================================================
// POST /api/dflow/order - Place an order
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      market_ticker,
      side,
      action,
      quantity,
      limit_price,
      slippage_tolerance = 0.02,
      execution_mode = "sync",
    } = body as {
      market_ticker: string;
      side: "yes" | "no";
      action: "buy" | "sell";
      quantity: number;
      limit_price?: number;
      slippage_tolerance?: number;
      execution_mode?: "sync" | "async";
    };

    // Validate required fields
    if (!market_ticker || !side || !action || !quantity) {
      return NextResponse.json(
        { error: "market_ticker, side, action, and quantity are required" },
        { status: 400 },
      );
    }

    if (quantity <= 0) {
      return NextResponse.json(
        { error: "quantity must be positive" },
        { status: 400 },
      );
    }

    if (limit_price !== undefined && (limit_price < 0 || limit_price > 1)) {
      return NextResponse.json(
        { error: "limit_price must be between 0 and 1" },
        { status: 400 },
      );
    }

    console.log("[dflow/order] Placing order:", {
      market_ticker,
      side,
      action,
      quantity,
      limit_price,
      slippage_tolerance,
      execution_mode,
    });

    // Build order request for dflow Swap API
    const orderRequest = {
      market_ticker,
      side,
      action,
      quantity,
      ...(limit_price !== undefined && { limit_price }),
      slippage_tolerance,
    };

    const response = await dflowSwapFetch("/order", {
      method: "POST",
      body: JSON.stringify(orderRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/order] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow Swap API error: ${response.status} - ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/order] Order response:", data);

    return NextResponse.json({
      success: true,
      order: data,
      execution_mode,
    });
  } catch (error) {
    console.error("[dflow/order] Failed to place order:", error);
    return NextResponse.json(
      { error: "Failed to place order" },
      { status: 500 },
    );
  }
}
