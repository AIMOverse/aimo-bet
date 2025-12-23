"use client";

import useSWR from "swr";
import { fetchPortfolioPositions } from "../api";
import { POLLING_INTERVALS } from "../constants";
import type { Position } from "@/types/arena";

/**
 * Hook to fetch positions for a portfolio
 */
export function usePositions(portfolioId: string | null, openOnly = true) {
  const { data, error, isLoading, mutate } = useSWR<Position[]>(
    portfolioId ? `arena/positions/${portfolioId}/${openOnly}` : null,
    () => (portfolioId ? fetchPortfolioPositions(portfolioId, openOnly) : []),
    {
      refreshInterval: POLLING_INTERVALS.positions,
    }
  );

  return {
    positions: data || [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch all positions for a session (across all portfolios)
 * This requires fetching portfolios first, then positions for each
 */
export function useSessionPositions(sessionId: string | null) {
  // This would need additional API support to fetch all positions for a session
  // For now, return empty array - implement when needed
  return {
    positions: [] as Position[],
    isLoading: false,
    error: null,
    mutate: () => {},
  };
}
