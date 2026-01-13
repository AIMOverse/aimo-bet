// ============================================================================
// Get Trades Tool
// Trade history from Polymarket (Kalshi user trades not available via dflow)
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { type Wallet } from "ethers";
import { createClobClient } from "@/lib/prediction-market/polymarket/clob";
import type { Trade, TradeSummary, GetTradesResult } from "./types";

// ============================================================================
// Types from @polymarket/clob-client
// ============================================================================

interface PolymarketTrade {
  id: string;
  taker_order_id: string;
  market: string;
  asset_id: string;
  side: "BUY" | "SELL";
  size: string;
  fee_rate_bps: string;
  price: string;
  status: string;
  match_time: string;
  last_update: string;
  outcome: string;
  maker_address: string;
  owner: string;
  transaction_hash?: string;
  bucket_index: number;
  type: "TAKER" | "MAKER";
}

interface TradeParams {
  id?: string;
  maker_address?: string;
  market?: string;
  asset_id?: string;
  before?: string;
  after?: string;
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create getTrades tool bound to Polymarket wallet
 *
 * Returns the user's trade history from Polymarket.
 * Note: Kalshi/dflow does not provide user-specific trade history.
 *
 * @param polymarketWallet - ethers Wallet for Polymarket authentication
 */
export function createGetTradesTool(polymarketWallet?: Wallet) {
  return tool({
    description:
      "Get your trade history from Polymarket. " +
      "Returns filled orders where you were taker or maker. " +
      "Note: Kalshi trade history is not available (dflow API limitation).",
    inputSchema: z.object({
      market_id: z
        .string()
        .optional()
        .describe("Filter to specific market (conditionId for Polymarket)"),
      after: z
        .string()
        .optional()
        .describe("Only trades after this ISO timestamp"),
      before: z
        .string()
        .optional()
        .describe("Only trades before this ISO timestamp"),
      limit: z
        .number()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Max trades to return (default: 100)"),
      paginate_all: z
        .boolean()
        .default(true)
        .describe("Auto-paginate to fetch all matching trades (default: true)"),
    }),
    execute: async ({
      market_id,
      after,
      before,
      limit = 100,
      paginate_all = true,
    }): Promise<GetTradesResult> => {
      const logPrefix = "[management/getTrades]";

      if (!polymarketWallet) {
        return {
          success: false,
          trades: [],
          summary: createEmptySummary(),
          error: "No Polymarket wallet configured. Cannot fetch trades.",
        };
      }

      try {
        console.log(`${logPrefix} Fetching trades:`, {
          market_id,
          after,
          before,
          limit,
          paginate_all,
        });

        // Create authenticated CLOB client
        const client = await createClobClient(polymarketWallet);

        // Build trade params
        const params: TradeParams = {};

        if (market_id) {
          params.market = market_id;
        }

        if (after) {
          params.after = toUnixTimestamp(after);
        }

        if (before) {
          params.before = toUnixTimestamp(before);
        }

        // Fetch trades
        // getTrades(params, only_first_page) - false means fetch all pages
        const rawTrades = (await client.getTrades(
          params,
          !paginate_all,
        )) as unknown as PolymarketTrade[];

        console.log(`${logPrefix} Fetched ${rawTrades.length} raw trades`);

        // Apply limit
        const limitedTrades = rawTrades.slice(0, limit);

        // Transform to unified format
        const trades = limitedTrades.map(transformPolymarketTrade);

        // Calculate summary
        const summary = calculateSummary(trades);

        console.log(
          `${logPrefix} Returning ${trades.length} trades, volume: ${summary.total_volume.toFixed(2)}`,
        );

        return {
          success: true,
          trades,
          summary,
        };
      } catch (error) {
        console.error(`${logPrefix} Error:`, error);
        return {
          success: false,
          trades: [],
          summary: createEmptySummary(),
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert ISO timestamp to unix timestamp string
 */
function toUnixTimestamp(isoOrUnix: string): string {
  // If already numeric, return as-is
  if (/^\d+$/.test(isoOrUnix)) {
    return isoOrUnix;
  }

  // Parse ISO and convert to unix seconds
  const date = new Date(isoOrUnix);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${isoOrUnix}`);
  }

  return Math.floor(date.getTime() / 1000).toString();
}

/**
 * Transform Polymarket trade to unified Trade format
 */
function transformPolymarketTrade(trade: PolymarketTrade): Trade {
  const size = parseFloat(trade.size);
  const price = parseFloat(trade.price);

  return {
    exchange: "polymarket",
    trade_id: trade.id,
    market_id: trade.market,
    asset_id: trade.asset_id,
    side: trade.side.toLowerCase() as "buy" | "sell",
    outcome: trade.outcome,
    size,
    price,
    fee_rate_bps: parseInt(trade.fee_rate_bps, 10),
    role: trade.type.toLowerCase() as "taker" | "maker",
    status: trade.status,
    match_time: formatMatchTime(trade.match_time),
    transaction_hash: trade.transaction_hash,
  };
}

/**
 * Format match_time to ISO string
 */
function formatMatchTime(matchTime: string): string {
  // If already ISO format, return as-is
  if (matchTime.includes("T") || matchTime.includes("-")) {
    return matchTime;
  }

  // Assume unix timestamp (seconds)
  const timestamp = parseInt(matchTime, 10);
  if (!isNaN(timestamp)) {
    return new Date(timestamp * 1000).toISOString();
  }

  return matchTime;
}

/**
 * Calculate trade summary statistics
 */
function calculateSummary(trades: Trade[]): TradeSummary {
  let totalVolume = 0;
  let totalFees = 0;
  let buys = 0;
  let sells = 0;

  for (const trade of trades) {
    const tradeValue = trade.size * trade.price;
    totalVolume += tradeValue;

    // Fee calculation: fee_rate_bps is basis points
    const feeAmount = tradeValue * (trade.fee_rate_bps / 10000);
    totalFees += feeAmount;

    if (trade.side === "buy") {
      buys++;
    } else {
      sells++;
    }
  }

  return {
    total_trades: trades.length,
    total_volume: totalVolume,
    total_fees: totalFees,
    buys,
    sells,
  };
}

/**
 * Create empty summary for error cases
 */
function createEmptySummary(): TradeSummary {
  return {
    total_trades: 0,
    total_volume: 0,
    total_fees: 0,
    buys: 0,
    sells: 0,
  };
}

// ============================================================================
// Export
// ============================================================================

export const getTradesTool = createGetTradesTool;
