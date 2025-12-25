import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getLiveData Tool - Get live market data by milestone IDs
// ============================================================================

export const getLiveDataTool = tool({
  description:
    "Get live market data (prices, orderbook) for specific milestones. Use getMarkets first to obtain milestoneIds, then call this tool with those IDs.",
  inputSchema: z.object({
    milestoneIds: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe("Array of milestone IDs to get live data for (max 100). Get these from market data."),
  }),
  execute: async ({ milestoneIds }) => {
    console.log("[getLiveData] execute() called with", milestoneIds.length, "milestone IDs");

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const url = `${baseUrl}/api/dflow/live-data?milestoneIds=${milestoneIds.join(",")}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[getLiveData] API error:", response.status, errorText);
        return {
          success: false,
          error: `Failed to fetch live data: ${response.status}`,
        };
      }

      const data = await response.json();
      console.log("[getLiveData] Fetched live data successfully");

      return {
        success: true,
        liveData: data,
      };
    } catch (error) {
      console.log("[getLiveData] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
