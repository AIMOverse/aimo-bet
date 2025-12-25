import { NextResponse } from "next/server";
import { dflowSwapFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Swap API - Order Status
// Docs: https://pond.dflow.net/swap-api-reference/order/order-status
// ============================================================================

// ============================================================================
// GET /api/dflow/order/[id] - Get order status
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 },
      );
    }

    console.log("[dflow/order/id] Fetching order status:", id);

    const response = await dflowSwapFetch(
      `/order-status?order_id=${encodeURIComponent(id)}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/order/id] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/order/id] Order status:", data);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/order/id] Failed to fetch order status:", error);
    return NextResponse.json(
      { error: "Failed to fetch order status" },
      { status: 500 },
    );
  }
}

// ============================================================================
// DELETE /api/dflow/order/[id] - Cancel order
// ============================================================================

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 },
      );
    }

    console.log("[dflow/order/id] Cancelling order:", id);

    const response = await dflowSwapFetch("/order", {
      method: "DELETE",
      body: JSON.stringify({ order_id: id }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[dflow/order/id] Cancel error:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("[dflow/order/id] Cancel result:", data);

    return NextResponse.json({
      success: true,
      result: data,
    });
  } catch (error) {
    console.error("[dflow/order/id] Failed to cancel order:", error);
    return NextResponse.json(
      { error: "Failed to cancel order" },
      { status: 500 },
    );
  }
}
