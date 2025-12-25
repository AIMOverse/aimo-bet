import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getMarkets Tool - Discover prediction markets
// ============================================================================

export const getMarketsTool = tool({
  description:
    "Get list of prediction markets. Use to discover trading opportunities.",
  inputSchema: z.object({
    status: z
      .enum(["active", "inactive", "closed", "determined", "finalized"])
      .optional()
      .default("active")
      .describe("Filter by market status. Default: active"),
    series: z
      .string()
      .optional()
      .describe("Filter by series ticker"),
    category: z
      .string()
      .optional()
      .describe("Filter by category (e.g., 'crypto', 'sports')"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Max markets to return"),
  }),
  execute: async ({ status, series, category, limit }) => {
    console.log("[getMarkets] execute() called with:", {
      status,
      series,
      category,
      limit,
    });

    try {
      const params = new URLSearchParams();
      params.set("status", status || "active");
      if (series) params.set("series", series);
      if (category) params.set("category", category);
      params.set("limit", String(limit || 20));

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(`${baseUrl}/api/dflow/markets?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[getMarkets] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to fetch markets: ${response.status}`,
        };
      }

      const data = await response.json();
      console.log("[getMarkets] Fetched", Array.isArray(data) ? data.length : 0, "markets");

      return {
        success: true,
        markets: data,
        count: Array.isArray(data) ? data.length : 0,
      };
    } catch (error) {
      console.log("[getMarkets] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
