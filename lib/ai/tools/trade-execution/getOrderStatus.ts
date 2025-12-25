import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getOrderStatus Tool - Check order status
// ============================================================================

export const getOrderStatusTool = tool({
  description: "Check the status of an async order.",
  inputSchema: z.object({
    order_id: z
      .string()
      .describe("Order ID from placeOrder response"),
  }),
  execute: async ({ order_id }) => {
    console.log("[getOrderStatus] execute() called with order_id:", order_id);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(
        `${baseUrl}/api/dflow/order/${encodeURIComponent(order_id)}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[getOrderStatus] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to fetch order status: ${response.status}`,
          order_id,
        };
      }

      const data = await response.json();
      console.log("[getOrderStatus] Order status:", data);

      return {
        success: true,
        status: data,
        order_id,
      };
    } catch (error) {
      console.log("[getOrderStatus] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        order_id,
      };
    }
  },
});
