"use client";

import { useMemo } from "react";
import type { AgentPosition } from "./usePositions";
import {
  usePriceSubscription,
  type UsePriceSubscriptionReturn,
} from "./usePriceSubscription";

/**
 * High-level hook that auto-subscribes to price updates based on positions.
 *
 * Extracts unique market tickers from positions and subscribes to their
 * price updates via WebSocket connections (Kalshi via PartyKit, Polymarket direct).
 *
 * @param positions - Array of agent positions to subscribe to
 * @returns Price subscription state including prices map, connection status, and errors
 */
export function usePositionPrices(
  positions: AgentPosition[]
): UsePriceSubscriptionReturn {
  // Extract unique tickers from positions
  const tickers = useMemo(
    () => [...new Set(positions.map((p) => p.marketTicker))],
    [positions]
  );

  return usePriceSubscription(tickers);
}
