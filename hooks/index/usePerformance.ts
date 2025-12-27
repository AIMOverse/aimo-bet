"use client";

import useSWR from "swr";
import { POLLING_INTERVALS } from "@/lib/config";
import { MODELS } from "@/lib/ai/models/models";
import type { PerformanceSnapshot, ChartDataPoint } from "@/lib/supabase/types";
import type { ModelDefinition } from "@/lib/ai/models/types";

/**
 * Convert performance snapshots to chart data format for Recharts.
 * Pivots from normalized DB format (one row per model per timestamp)
 * to denormalized format (one object per timestamp with all model values).
 */
function snapshotsToChartData(
  snapshots: PerformanceSnapshot[],
  models: ModelDefinition[],
): ChartDataPoint[] {
  const dataByTime = new Map<string, ChartDataPoint>();

  // Create a model ID to name mapping
  const modelNames = new Map<string, string>();
  models.forEach((m) => modelNames.set(m.id, m.name));

  snapshots.forEach((snapshot) => {
    const timeKey = snapshot.timestamp.toISOString();

    if (!dataByTime.has(timeKey)) {
      dataByTime.set(timeKey, { timestamp: timeKey });
    }

    const point = dataByTime.get(timeKey)!;
    const modelName = modelNames.get(snapshot.modelId) || snapshot.modelId;
    point[modelName] = snapshot.accountValue;
  });

  return Array.from(dataByTime.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

/**
 * Fetch performance snapshots from API
 */
async function fetchPerformanceSnapshots(
  sessionId: string,
  hoursBack: number,
): Promise<PerformanceSnapshot[]> {
  const res = await fetch(
    `/api/performance?sessionId=${sessionId}&hoursBack=${hoursBack}`,
  );
  if (!res.ok) throw new Error("Failed to fetch snapshots");
  return res.json();
}

/**
 * Hook to fetch performance snapshots and convert to chart data
 */
export function usePerformance(sessionId: string | null, hoursBack = 24) {
  const {
    data: snapshots,
    error,
    isLoading,
    mutate,
  } = useSWR<PerformanceSnapshot[]>(
    sessionId ? `performance/${sessionId}/${hoursBack}` : null,
    () => (sessionId ? fetchPerformanceSnapshots(sessionId, hoursBack) : []),
    {
      refreshInterval: POLLING_INTERVALS.performance,
    },
  );

  // Get enabled models for arena
  const arenaModels = MODELS.filter((m) => m.enabled);

  // Convert to chart data using models
  const chartData: ChartDataPoint[] =
    snapshots && arenaModels.length > 0
      ? snapshotsToChartData(snapshots, arenaModels)
      : [];

  return {
    snapshots: snapshots || [],
    chartData,
    models: arenaModels,
    isLoading,
    error,
    mutate,
  };
}
