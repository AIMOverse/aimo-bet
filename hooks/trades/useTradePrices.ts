"use client";

import { useMemo } from "react";
import type { AgentTrade } from "./useTrades";
import {
  usePriceSubscription,
  type UsePriceSubscriptionReturn,
} from "../usePriceSubscription";

/**
 * High-level hook that auto-subscribes to price updates based on trades.
 *
 * Extracts unique market tickers from trades and subscribes to their
 * price updates via WebSocket connections (Kalshi via PartyKit, Polymarket direct).
 *
 * @param trades - Array of agent trades to subscribe to
 * @returns Price subscription state including prices map, connection status, and errors
 */
export function useTradePrices(
  trades: AgentTrade[]
): UsePriceSubscriptionReturn {
  // Extract unique tickers from trades
  const tickers = useMemo(
    () => [...new Set(trades.map((t) => t.marketTicker))],
    [trades]
  );

  return usePriceSubscription(tickers);
}
