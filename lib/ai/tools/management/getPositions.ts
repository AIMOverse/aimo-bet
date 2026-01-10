// ============================================================================
// Get Positions Tool
// Multi-exchange positions across Kalshi and Polymarket
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { getUserPositions } from "@/lib/prediction-market/kalshi/dflow/prediction-markets/retrieve";
import {
  getPositions as getPolymarketPositions,
  getClosedPositions as getPolymarketClosedPositions,
} from "@/lib/prediction-market/polymarket/positions";
import type {
  ToolSigners,
  GetPositionsResult,
  Position,
  PositionSummary,
} from "./types";

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create getPositions tool bound to multi-chain signers
 * Returns positions from both Kalshi and Polymarket
 */
export function createGetPositionsTool(signers: ToolSigners) {
  return tool({
    description:
      "Get your current prediction market positions across exchanges. Returns positions from Kalshi and Polymarket with market details and P&L.",
    inputSchema: z.object({
      exchange: z
        .enum(["kalshi", "polymarket", "all"])
        .default("all")
        .describe("Which exchange to fetch positions from (default: all)"),
      status: z
        .enum(["active", "closed", "all"])
        .default("active")
        .describe("Filter by position status (default: active)"),
      market_id: z
        .string()
        .optional()
        .describe("Filter to a specific market ID (ticker for Kalshi, conditionId for Polymarket)"),
    }),
    execute: async ({
      exchange = "all",
      status = "active",
      market_id,
    }): Promise<GetPositionsResult> => {
      const logPrefix = "[management/getPositions]";
      console.log(`${logPrefix} Fetching positions: exchange=${exchange}, status=${status}`);

      const allPositions: Position[] = [];

      try {
        // Fetch Kalshi positions
        if (exchange === "all" || exchange === "kalshi") {
          const kalshiPositions = await fetchKalshiPositions(
            signers.svm.address,
            status,
            market_id
          );
          allPositions.push(...kalshiPositions);
          console.log(`${logPrefix} Kalshi: ${kalshiPositions.length} positions`);
        }

        // Fetch Polymarket positions
        if (exchange === "all" || exchange === "polymarket") {
          const polymarketPositions = await fetchPolymarketPositions(
            signers.evm.address,
            status,
            market_id
          );
          allPositions.push(...polymarketPositions);
          console.log(`${logPrefix} Polymarket: ${polymarketPositions.length} positions`);
        }

        // Calculate summary
        const summary = calculateSummary(allPositions);

        console.log(`${logPrefix} Total: ${allPositions.length} positions`);

        return {
          success: true,
          positions: allPositions,
          summary,
        };
      } catch (error) {
        console.error(`${logPrefix} Error:`, error);
        return {
          success: false,
          positions: allPositions,
          summary: {
            total_positions: allPositions.length,
            active_positions: 0,
            closed_positions: 0,
          },
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

// ============================================================================
// Kalshi Position Fetcher
// ============================================================================

async function fetchKalshiPositions(
  address: string,
  status: "active" | "closed" | "all",
  marketId?: string
): Promise<Position[]> {
  const result = await getUserPositions(address);
  const positions: Position[] = [];

  for (const userPos of result.positions) {
    // Skip positions without market data
    if (!userPos.market) continue;

    // Filter by market ID if provided
    if (marketId && userPos.market.ticker !== marketId) continue;

    // Determine position status
    const isResolved = !!userPos.market.result;
    const positionStatus: "active" | "closed" = isResolved ? "closed" : "active";

    // Filter by status
    if (status !== "all" && positionStatus !== status) continue;

    positions.push({
      exchange: "kalshi",
      market_id: userPos.market.ticker,
      market_title: userPos.market.title,
      outcome: userPos.positionType === "YES" ? "yes" : "no",
      quantity: userPos.quantity,
      avg_price: 0, // Not available from Kalshi positions API
      status: positionStatus,
      // Note: current_price, current_value, pnl would require additional API calls
    });
  }

  return positions;
}

// ============================================================================
// Polymarket Position Fetcher
// ============================================================================

async function fetchPolymarketPositions(
  address: string,
  status: "active" | "closed" | "all",
  marketId?: string
): Promise<Position[]> {
  const positions: Position[] = [];

  // Fetch active positions
  if (status === "all" || status === "active") {
    try {
      const activePositions = await getPolymarketPositions(address, {
        market: marketId ? [marketId] : undefined,
      });

      for (const pos of activePositions) {
        positions.push(transformPolymarketPosition(pos, "active"));
      }
    } catch (error) {
      console.warn("[getPositions] Failed to fetch Polymarket active positions:", error);
    }
  }

  // Fetch closed positions
  if (status === "all" || status === "closed") {
    try {
      const closedPositions = await getPolymarketClosedPositions(address);

      for (const pos of closedPositions) {
        // Filter by market ID if provided
        if (marketId && pos.conditionId !== marketId) continue;

        positions.push(transformPolymarketPosition(pos, "closed"));
      }
    } catch (error) {
      console.warn("[getPositions] Failed to fetch Polymarket closed positions:", error);
    }
  }

  return positions;
}

// ============================================================================
// Transform Polymarket Position
// ============================================================================

function transformPolymarketPosition(
  pos: {
    conditionId: string;
    title: string;
    outcome: string;
    size: number;
    avgPrice: number;
    curPrice: number;
    currentValue: number;
    cashPnl: number;
    percentPnl: number;
    redeemable: boolean;
    proxyWallet: string;
  },
  status: "active" | "closed"
): Position {
  return {
    exchange: "polymarket",
    market_id: pos.conditionId,
    market_title: pos.title,
    outcome: pos.outcome.toLowerCase() === "yes" ? "yes" : "no",
    quantity: pos.size,
    avg_price: pos.avgPrice,
    current_price: pos.curPrice,
    current_value: pos.currentValue,
    pnl: pos.cashPnl,
    pnl_percent: pos.percentPnl,
    status,
    redeemable: pos.redeemable,
    proxy_wallet: pos.proxyWallet,
  };
}

// ============================================================================
// Calculate Summary
// ============================================================================

function calculateSummary(positions: Position[]): PositionSummary {
  const activePositions = positions.filter((p) => p.status === "active");
  const closedPositions = positions.filter((p) => p.status === "closed");

  // Calculate total value and PnL from positions that have this data
  const positionsWithValue = positions.filter((p) => p.current_value !== undefined);
  const totalValue =
    positionsWithValue.length > 0
      ? positionsWithValue.reduce((sum, p) => sum + (p.current_value || 0), 0)
      : undefined;

  const positionsWithPnl = positions.filter((p) => p.pnl !== undefined);
  const totalPnl =
    positionsWithPnl.length > 0
      ? positionsWithPnl.reduce((sum, p) => sum + (p.pnl || 0), 0)
      : undefined;

  return {
    total_positions: positions.length,
    active_positions: activePositions.length,
    closed_positions: closedPositions.length,
    total_value: totalValue,
    total_pnl: totalPnl,
  };
}

// ============================================================================
// Export standalone tool for direct import
// ============================================================================

export const getPositionsTool = createGetPositionsTool;
