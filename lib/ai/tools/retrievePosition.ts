// ============================================================================
// Retrieve Position Tool
// Get current prediction market positions for the agent's wallet
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import {
  getUserPositions,
  type UserPosition,
} from "@/lib/dflow/prediction-markets/retrieve";

// ============================================================================
// Types
// ============================================================================

interface PositionOutput {
  market_ticker: string;
  market_title: string;
  side: "yes" | "no";
  quantity: number;
  current_price?: number;
  market_value?: number;
  market_status: string;
  market_result?: string;
}

interface RetrievePositionResult {
  success: boolean;
  wallet: string;
  positions: PositionOutput[];
  summary: {
    total_positions: number;
    active_positions: number;
    resolved_positions: number;
    total_market_value?: number;
  };
  error?: string;
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create retrievePosition tool bound to a wallet address
 */
export function createRetrievePositionTool(walletAddress: string) {
  return tool({
    description:
      "Get current prediction market positions for your wallet. Returns all outcome token holdings with market details. Use to check your portfolio before trading or to find redeemable positions.",
    inputSchema: z.object({
      market_ticker: z
        .string()
        .optional()
        .describe(
          "Filter to a specific market ticker (optional). Omit to get all positions.",
        ),
    }),
    execute: async ({ market_ticker }): Promise<RetrievePositionResult> => {
      console.log("[retrievePosition] Fetching positions for:", walletAddress);

      try {
        // Get all positions from dflow
        const result = await getUserPositions(walletAddress);

        // Transform positions to output format
        let positions: PositionOutput[] = result.positions
          .filter((p) => p.market !== null)
          .map((p) => transformPosition(p));

        // Filter by market ticker if provided
        if (market_ticker) {
          positions = positions.filter(
            (p) =>
              p.market_ticker.toLowerCase() === market_ticker.toLowerCase(),
          );
        }

        // Calculate summary
        const activePositions = positions.filter(
          (p) => p.market_status === "active",
        );
        const resolvedPositions = positions.filter(
          (p) => p.market_result !== undefined,
        );

        // Calculate total market value if prices available
        let totalMarketValue: number | undefined;
        const positionsWithValue = positions.filter(
          (p) => p.market_value !== undefined,
        );
        if (positionsWithValue.length > 0) {
          totalMarketValue = positionsWithValue.reduce(
            (sum, p) => sum + (p.market_value || 0),
            0,
          );
        }

        console.log("[retrievePosition] Found", positions.length, "positions");

        return {
          success: true,
          wallet: walletAddress,
          positions,
          summary: {
            total_positions: positions.length,
            active_positions: activePositions.length,
            resolved_positions: resolvedPositions.length,
            total_market_value: totalMarketValue,
          },
        };
      } catch (error) {
        console.error("[retrievePosition] Error:", error);
        return {
          success: false,
          wallet: walletAddress,
          positions: [],
          summary: {
            total_positions: 0,
            active_positions: 0,
            resolved_positions: 0,
          },
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function transformPosition(position: UserPosition): PositionOutput {
  const market = position.market!;

  // Determine side from position type
  const side: "yes" | "no" = position.positionType === "YES" ? "yes" : "no";

  return {
    market_ticker: market.ticker,
    market_title: market.title,
    side,
    quantity: position.quantity,
    // current_price and market_value would require live data fetch
    // which we skip for now to keep the tool fast
    market_status: market.status,
    market_result: market.result || undefined,
  };
}

// ============================================================================
// Export standalone tool for direct import
// ============================================================================

export const retrievePositionTool = createRetrievePositionTool;
