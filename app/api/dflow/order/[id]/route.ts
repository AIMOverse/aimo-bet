import { NextResponse } from "next/server";

// ============================================================================
// dflow Swap API - Order Status
// Docs: https://pond.dflow.net/swap-api-reference/order/order-status
// ============================================================================

const DFLOW_SWAP_API = "https://swap-api.dflow.net";

// ============================================================================
// GET /api/dflow/order/[id] - Get order status
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    console.log("[dflow/order/id] Fetching order status:", id);

    const response = await fetch(
      `${DFLOW_SWAP_API}/order-status?order_id=${encodeURIComponent(id)}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/order/id] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("[dflow/order/id] Order status:", data);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/order/id] Failed to fetch order status:", error);
    return NextResponse.json(
      { error: "Failed to fetch order status" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/dflow/order/[id] - Cancel order
// ============================================================================

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    console.log("[dflow/order/id] Cancelling order:", id);

    const response = await fetch(`${DFLOW_SWAP_API}/order`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: id }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/order/id] Cancel error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}` },
        { status: response.status }
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
      { status: 500 }
    );
  }
}
