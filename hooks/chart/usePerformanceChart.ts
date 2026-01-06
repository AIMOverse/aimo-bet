"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChartDataPoint } from "@/lib/supabase/types";
import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";

interface UsePerformanceChartOptions {
  sessionId: string | null;
  /** Number of hours back to fetch data (default: 24). Ignored if `since` is provided. */
  hoursBack?: number;
  /** Fetch data since this timestamp (ISO string or Date). Takes precedence over `hoursBack`. */
  since?: string | Date;
}

interface UsePerformanceChartReturn {
  chartData: ChartDataPoint[];
  latestValues: Map<string, number>;
  deadModels: Set<string>;
  loading: boolean;
  error: Error | null;
}

interface AgentSessionRow {
  id: string;
  model_name: string;
  starting_capital: number;
  current_value: number;
}

interface DecisionRow {
  created_at: string;
  portfolio_value_after: number;
  model_name: string;
}

/**
 * Hook for fetching and subscribing to performance chart data.
 *
 * Uses agent_sessions as the source of truth for all models and their current values,
 * merged with agent_decisions for historical time-series data.
 *
 * This ensures all models appear on the chart even if they haven't made decisions yet.
 */
export function usePerformanceChart({
  sessionId,
  hoursBack = 24,
  since,
}: UsePerformanceChartOptions): UsePerformanceChartReturn {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [latestValues, setLatestValues] = useState<Map<string, number>>(
    new Map()
  );
  const [deadModels, setDeadModels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Store agent sessions for reference
  const [agentSessions, setAgentSessions] = useState<
    Map<string, AgentSessionRow>
  >(new Map());

  /**
   * Transform raw decision data into chart format, ensuring all models are included.
   * Models without decisions show as flat lines at their starting capital.
   */
  const transformToChartData = useCallback(
    (
      decisions: DecisionRow[],
      sessions: Map<string, AgentSessionRow>
    ): ChartDataPoint[] => {
      // Get all model names from sessions (source of truth)
      const allModels = Array.from(sessions.values()).map((s) => s.model_name);

      if (allModels.length === 0) {
        return [];
      }

      // Group decisions by timestamp
      const grouped = new Map<string, Record<string, number>>();

      for (const row of decisions) {
        const timestamp = row.created_at;
        if (!grouped.has(timestamp)) {
          grouped.set(timestamp, {});
        }
        grouped.get(timestamp)![row.model_name] = row.portfolio_value_after;
      }

      // Get sorted timestamps
      const sortedTimestamps = Array.from(grouped.keys()).sort();

      // Initialize last known values with starting capital for all models
      const lastKnownValues: Record<string, number> = {};
      for (const session of sessions.values()) {
        lastKnownValues[session.model_name] = session.starting_capital;
      }

      // If no decisions exist, create a single point at "now" with starting values
      if (sortedTimestamps.length === 0) {
        const now = new Date().toISOString();
        const point: ChartDataPoint = { timestamp: now };
        for (const model of allModels) {
          point[model] = lastKnownValues[model];
        }
        return [point];
      }

      // Build chart data with fill-forward for all models
      const result: ChartDataPoint[] = [];

      for (const timestamp of sortedTimestamps) {
        const values = grouped.get(timestamp)!;

        // Update last known values for models that have data at this timestamp
        for (const model of allModels) {
          if (values[model] !== undefined) {
            lastKnownValues[model] = values[model];
          }
        }

        // Create chart point with all models' values (fill-forward)
        const point: ChartDataPoint = { timestamp };
        for (const model of allModels) {
          point[model] = lastKnownValues[model];
        }

        result.push(point);
      }

      return result;
    },
    []
  );

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !sessionId) {
      setLoading(false);
      return;
    }

    // Use `since` if provided, otherwise calculate from `hoursBack`
    const sinceTimestamp = since
      ? since instanceof Date
        ? since.toISOString()
        : since
      : new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch all agent sessions for this trading session (source of truth for models)
        const { data: sessionsData, error: sessionsError } = await client
          .from("agent_sessions")
          .select("id, model_name, starting_capital, current_value")
          .eq("session_id", sessionId);

        if (sessionsError) {
          throw new Error(sessionsError.message);
        }

        // Build sessions map
        const sessionsMap = new Map<string, AgentSessionRow>();
        const latestValuesMap = new Map<string, number>();
        const deadModelsSet = new Set<string>();

        for (const row of sessionsData || []) {
          const session = row as AgentSessionRow;
          sessionsMap.set(session.id, session);
          latestValuesMap.set(session.model_name, session.current_value);

          if (session.current_value <= 0) {
            deadModelsSet.add(session.model_name);
          }
        }

        setAgentSessions(sessionsMap);
        setLatestValues(latestValuesMap);
        setDeadModels(deadModelsSet);

        // 2. Fetch historical decisions for chart time-series
        const { data: decisionsData, error: decisionsError } = await client
          .from("agent_decisions")
          .select(
            `
            created_at,
            portfolio_value_after,
            agent_sessions!inner(session_id, model_name)
          `
          )
          .eq("agent_sessions.session_id", sessionId)
          .gte("created_at", sinceTimestamp)
          .order("created_at", { ascending: true });

        if (decisionsError) {
          throw new Error(decisionsError.message);
        }

        // Flatten decisions data
        const decisions: DecisionRow[] = (decisionsData || []).map(
          (row: Record<string, unknown>) => {
            const agentSessions = row.agent_sessions as { model_name: string };
            return {
              created_at: row.created_at as string,
              portfolio_value_after: row.portfolio_value_after as number,
              model_name: agentSessions.model_name,
            };
          }
        );

        // Transform to chart data (all models included)
        setChartData(transformToChartData(decisions, sessionsMap));
      } catch (err) {
        console.error("[usePerformanceChart] Error fetching data:", err);
        setError(
          err instanceof Error ? err : new Error("Failed to fetch chart data")
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Subscribe to realtime updates on both tables
    const channel = client
      .channel(`chart:${sessionId}`)
      // Listen for new decisions (adds chart points)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_decisions",
        },
        async (
          payload: RealtimePostgresInsertPayload<Record<string, unknown>>
        ) => {
          try {
            const agentSessionId = payload.new.agent_session_id as string;

            // Get model name from our cached sessions
            const session = agentSessions.get(agentSessionId);
            let modelName = session?.model_name;

            // If not in cache, fetch from DB
            if (!modelName) {
              const { data: agentSession } = await client
                .from("agent_sessions")
                .select("model_name, session_id")
                .eq("id", agentSessionId)
                .single();

              const fetchedSession = agentSession as {
                model_name: string;
                session_id: string;
              } | null;

              if (!fetchedSession || fetchedSession.session_id !== sessionId) {
                return;
              }

              modelName = fetchedSession.model_name;
            }

            const newPoint: DecisionRow = {
              created_at: payload.new.created_at as string,
              portfolio_value_after: payload.new
                .portfolio_value_after as number,
              model_name: modelName,
            };

            // Update chart data
            setChartData((prev: ChartDataPoint[]) => {
              const updated = [...prev];
              const existingPointIndex = updated.findIndex(
                (p) => p.timestamp === newPoint.created_at
              );

              if (existingPointIndex >= 0) {
                // Update existing point
                updated[existingPointIndex] = {
                  ...updated[existingPointIndex],
                  [newPoint.model_name]: newPoint.portfolio_value_after,
                };
              } else {
                // Add new point (carry forward previous values for other models)
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
            setLatestValues((prev) => {
              const updated = new Map(prev);
              updated.set(newPoint.model_name, newPoint.portfolio_value_after);
              return updated;
            });

            // Check if model is now dead
            if (newPoint.portfolio_value_after <= 0) {
              setDeadModels((prev) => new Set(prev).add(newPoint.model_name));
            }
          } catch (err) {
            console.error(
              "[usePerformanceChart] Error processing decision update:",
              err
            );
          }
        }
      )
      // Listen for agent_sessions updates (current_value changes)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_sessions",
        },
        (payload: RealtimePostgresUpdatePayload<Record<string, unknown>>) => {
          try {
            const sessionIdFromPayload = payload.new.session_id as string;

            // Only process updates for our session
            if (sessionIdFromPayload !== sessionId) {
              return;
            }

            const modelName = payload.new.model_name as string;
            const currentValue = payload.new.current_value as number;

            // Update latest values
            setLatestValues((prev) => {
              const updated = new Map(prev);
              updated.set(modelName, currentValue);
              return updated;
            });

            // Update dead models status
            if (currentValue <= 0) {
              setDeadModels((prev) => new Set(prev).add(modelName));
            } else {
              setDeadModels((prev) => {
                const updated = new Set(prev);
                updated.delete(modelName);
                return updated;
              });
            }

            // Update agent sessions cache
            setAgentSessions((prev) => {
              const updated = new Map(prev);
              const id = payload.new.id as string;
              const existing = updated.get(id);
              if (existing) {
                updated.set(id, { ...existing, current_value: currentValue });
              }
              return updated;
            });
          } catch (err) {
            console.error(
              "[usePerformanceChart] Error processing session update:",
              err
            );
          }
        }
      )
      // Listen for new agent_sessions (new models joining)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_sessions",
        },
        (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
          try {
            const sessionIdFromPayload = payload.new.session_id as string;

            // Only process inserts for our session
            if (sessionIdFromPayload !== sessionId) {
              return;
            }

            const newSession: AgentSessionRow = {
              id: payload.new.id as string,
              model_name: payload.new.model_name as string,
              starting_capital: payload.new.starting_capital as number,
              current_value: payload.new.current_value as number,
            };

            // Add to sessions cache
            setAgentSessions((prev) => {
              const updated = new Map(prev);
              updated.set(newSession.id, newSession);
              return updated;
            });

            // Add to latest values
            setLatestValues((prev) => {
              const updated = new Map(prev);
              updated.set(newSession.model_name, newSession.current_value);
              return updated;
            });

            // Add to chart data (new model starts at starting capital)
            setChartData((prev) => {
              if (prev.length === 0) {
                return [
                  {
                    timestamp: new Date().toISOString(),
                    [newSession.model_name]: newSession.starting_capital,
                  },
                ];
              }

              // Add the new model to all existing points at starting capital
              return prev.map((point, index) => ({
                ...point,
                [newSession.model_name]:
                  index === prev.length - 1
                    ? newSession.current_value
                    : newSession.starting_capital,
              }));
            });

            // Check if dead
            if (newSession.current_value <= 0) {
              setDeadModels((prev) => new Set(prev).add(newSession.model_name));
            }
          } catch (err) {
            console.error(
              "[usePerformanceChart] Error processing new session:",
              err
            );
          }
        }
      )
      .subscribe((status: string) => {
        console.log(`[usePerformanceChart] Subscription status: ${status}`);
      });

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId, hoursBack, transformToChartData, agentSessions]);

  return { chartData, latestValues, deadModels, loading, error };
}
