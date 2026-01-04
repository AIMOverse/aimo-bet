"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChartDataPoint } from "@/lib/supabase/types";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";

interface UsePerformanceChartOptions {
  sessionId: string | null;
  hoursBack?: number;
}

interface UsePerformanceChartReturn {
  chartData: ChartDataPoint[];
  latestValues: Map<string, number>;
  deadModels: Set<string>;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook for fetching and subscribing to performance chart data from agent_decisions.
 * Transforms portfolio_value_after into chart-friendly format with realtime updates.
 */
export function usePerformanceChart({
  sessionId,
  hoursBack = 24,
}: UsePerformanceChartOptions): UsePerformanceChartReturn {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [latestValues, setLatestValues] = useState<Map<string, number>>(
    new Map(),
  );
  const [deadModels, setDeadModels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Transform raw data into chart format
  const transformToChartData = useCallback(
    (
      rows: Array<{
        created_at: string;
        portfolio_value_after: number;
        model_name: string;
      }>,
    ): ChartDataPoint[] => {
      // Group by timestamp
      const grouped = new Map<string, Record<string, number>>();

      for (const row of rows) {
        const timestamp = row.created_at;
        if (!grouped.has(timestamp)) {
          grouped.set(timestamp, {});
        }
        grouped.get(timestamp)![row.model_name] = row.portfolio_value_after;
      }

      // Convert to array and fill forward values for each model
      const sortedTimestamps = Array.from(grouped.keys()).sort();
      const allModels = new Set<string>();

      for (const row of rows) {
        allModels.add(row.model_name);
      }

      // Fill forward: carry the last known value for each model
      const lastKnownValues: Record<string, number> = {};
      const result: ChartDataPoint[] = [];

      for (const timestamp of sortedTimestamps) {
        const values = grouped.get(timestamp)!;

        // Update last known values
        for (const model of allModels) {
          if (values[model] !== undefined) {
            lastKnownValues[model] = values[model];
          }
        }

        // Create chart point with all models' values
        const point: ChartDataPoint = { timestamp };
        for (const model of allModels) {
          if (lastKnownValues[model] !== undefined) {
            point[model] = lastKnownValues[model];
          }
        }

        result.push(point);
      }

      return result;
    },
    [],
  );

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !sessionId) {
      setLoading(false);
      return;
    }

    const since = new Date(
      Date.now() - hoursBack * 60 * 60 * 1000,
    ).toISOString();

    const fetchChartData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await client
          .from("agent_decisions")
          .select(
            `
            created_at,
            portfolio_value_after,
            agent_sessions!inner(session_id, model_name)
          `,
          )
          .eq("agent_sessions.session_id", sessionId)
          .gte("created_at", since)
          .order("created_at", { ascending: true });

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        if (data) {
          // Flatten the data
          const flattened = data.map((row: Record<string, unknown>) => {
            const agentSessions = row.agent_sessions as { model_name: string };
            return {
              created_at: row.created_at as string,
              portfolio_value_after: row.portfolio_value_after as number,
              model_name: agentSessions.model_name,
            };
          });

          setChartData(transformToChartData(flattened));

          // Extract latest values for each model
          const latest = new Map<string, number>();
          for (const row of flattened) {
            latest.set(row.model_name, row.portfolio_value_after);
          }
          setLatestValues(latest);

          // Check for dead models (portfolio value <= 0)
          const dead = new Set<string>();
          for (const [modelName, value] of latest) {
            if (value <= 0) {
              dead.add(modelName);
            }
          }
          if (dead.size > 0) {
            setDeadModels(dead);
          }
        }
      } catch (err) {
        console.error("[usePerformanceChart] Error fetching chart data:", err);
        setError(
          err instanceof Error ? err : new Error("Failed to fetch chart data"),
        );
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();

    // Subscribe to realtime updates
    const channel = client
      .channel(`chart:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_decisions",
        },
        async (
          payload: RealtimePostgresInsertPayload<Record<string, unknown>>,
        ) => {
          try {
            // Fetch the agent session to get model name
            const { data: agentSession } = await client
              .from("agent_sessions")
              .select("model_name, session_id")
              .eq("id", payload.new.agent_session_id as string)
              .single();

            const session = agentSession as {
              model_name: string;
              session_id: string;
            } | null;

            if (session && session.session_id === sessionId) {
              const newPoint = {
                created_at: payload.new.created_at as string,
                portfolio_value_after: payload.new
                  .portfolio_value_after as number,
                model_name: session.model_name,
              };

              // Update chart data
              setChartData((prev: ChartDataPoint[]) => {
                const updated = [...prev];
                const existingPointIndex = updated.findIndex(
                  (p) => p.timestamp === newPoint.created_at,
                );

                if (existingPointIndex >= 0) {
                  // Update existing point
                  updated[existingPointIndex] = {
                    ...updated[existingPointIndex],
                    [newPoint.model_name]: newPoint.portfolio_value_after,
                  };
                } else {
                  // Add new point (carry forward previous values)
                  const lastPoint = updated[updated.length - 1] || {};
                  updated.push({
                    ...lastPoint,
                    timestamp: newPoint.created_at,
                    [newPoint.model_name]: newPoint.portfolio_value_after,
                  });
                }

                return updated;
              });

              // Update latest values
              setLatestValues((prev: Map<string, number>) => {
                const updated = new Map(prev);
                updated.set(
                  newPoint.model_name,
                  newPoint.portfolio_value_after,
                );
                return updated;
              });

              // Check if model is now dead
              if (newPoint.portfolio_value_after <= 0) {
                setDeadModels((prev) => new Set(prev).add(newPoint.model_name));
              }
            }
          } catch (err) {
            console.error(
              "[usePerformanceChart] Error processing realtime update:",
              err,
            );
          }
        },
      )
      .subscribe((status: string) => {
        console.log(`[usePerformanceChart] Subscription status: ${status}`);
      });

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId, hoursBack, transformToChartData]);

  return { chartData, latestValues, deadModels, loading, error };
}
