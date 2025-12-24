import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// cancelOrder Tool - Cancel a pending order
// ============================================================================

export const cancelOrderTool = tool({
  description: "Cancel a pending async order.",
  inputSchema: z.object({
    order_id: z
      .string()
      .describe("Order ID to cancel"),
  }),
  execute: async ({ order_id }) => {
    console.log("[cancelOrder] execute() called with order_id:", order_id);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(
        `${baseUrl}/api/dflow/order/${encodeURIComponent(order_id)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[cancelOrder] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to cancel order: ${response.status}`,
          order_id,
        };
      }

      const data = await response.json();
      console.log("[cancelOrder] Cancel result:", data);

      return {
        success: true,
        result: data,
        order_id,
      };
    } catch (error) {
      console.log("[cancelOrder] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        order_id,
      };
    }
  },
});
