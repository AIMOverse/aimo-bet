"use client";

import useSWR from "swr";
import { fetchPerformanceSnapshots, fetchModels } from "../api";
import { POLLING_INTERVALS } from "../constants";
import { snapshotsToChartData } from "../mock/performance";
import type { PerformanceSnapshot, ChartDataPoint, ArenaModel } from "@/types/arena";

/**
 * Hook to fetch performance snapshots and convert to chart data
 */
export function usePerformance(sessionId: string | null, hoursBack = 24) {
  // Fetch snapshots
  const {
    data: snapshots,
    error: snapshotsError,
    isLoading: snapshotsLoading,
    mutate: mutateSnapshots,
  } = useSWR<PerformanceSnapshot[]>(
    sessionId ? `arena/snapshots/${sessionId}/${hoursBack}` : null,
    () => (sessionId ? fetchPerformanceSnapshots(sessionId, hoursBack) : []),
    {
      refreshInterval: POLLING_INTERVALS.performance,
    }
  );

  // Fetch models for color mapping
  const {
    data: models,
    error: modelsError,
    isLoading: modelsLoading,
  } = useSWR<ArenaModel[]>("arena/models", () => fetchModels(false), {
    revalidateOnFocus: false,
  });

  // Convert to chart data
  const chartData: ChartDataPoint[] =
    snapshots && models ? snapshotsToChartData(snapshots, models) : [];

  return {
    snapshots: snapshots || [],
    chartData,
    models: models || [],
    isLoading: snapshotsLoading || modelsLoading,
    error: snapshotsError || modelsError,
    mutate: mutateSnapshots,
  };
}

/**
 * Hook to fetch just the models
 */
export function useArenaModels(includeDisabled = false) {
  const { data, error, isLoading, mutate } = useSWR<ArenaModel[]>(
    `arena/models/${includeDisabled}`,
    () => fetchModels(includeDisabled),
    {
      revalidateOnFocus: false,
    }
  );

  return {
    models: data || [],
    isLoading,
    error,
    mutate,
  };
}
