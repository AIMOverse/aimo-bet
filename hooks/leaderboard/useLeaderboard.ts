"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MODELS } from "@/lib/ai/models/catalog";
import type {
  RealtimePostgresUpdatePayload,
  RealtimePostgresInsertPayload,
} from "@supabase/supabase-js";

export interface LeaderboardEntry {
  modelId: string;
  modelName: string;
  chartColor: string;
  series?: string;
  rank: number;
  accountValue: number;
  returnPercent: number;
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  biggestWin: number | null;
  biggestLoss: number | null;
  totalInferenceCost: number;
  sharpeRatio: number | null;
}

interface TradeStats {
  totalTrades: number;
  wins: number;
  tradesWithPnl: number;
  biggestWin: number | null;
  biggestLoss: number | null;
}

interface AgentSessionRow {
  id: string;
  model_id: string;
  model_name: string;
  starting_capital: number;
  current_value: number;
  total_tokens: number;
}

interface UseLeaderboardOptions {
  sessionId: string | null;
}

interface UseLeaderboardReturn {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
}

/**
 * Calculate Sharpe ratio from daily portfolio values.
 * Returns annualized Sharpe assuming 365 trading days.
 */
function calculateSharpeFromValues(
  dailyValues: Map<string, number>
): number | null {
  const sortedDates = Array.from(dailyValues.keys()).sort();
  if (sortedDates.length < 2) return null;

  // Calculate daily returns
  const returns: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const prevValue = dailyValues.get(sortedDates[i - 1])!;
    const currValue = dailyValues.get(sortedDates[i])!;
    if (prevValue > 0) {
      returns.push((currValue - prevValue) / prevValue);
    }
  }

  if (returns.length < 2) return null;

  // Calculate mean and std deviation
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Sharpe = (mean return) / stdDev, annualized
  if (stdDev === 0) return null;
  return (mean / stdDev) * Math.sqrt(365);
}

/**
 * Hook for fetching and subscribing to leaderboard data.
 * Provides real-time updates for agent rankings, trade statistics, and performance metrics.
 */
export function useLeaderboard({
  sessionId,
}: UseLeaderboardOptions): UseLeaderboardReturn {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Cache for trade stats and sessions (refs to avoid effect re-runs)
  const tradeStatsRef = useRef<Map<string, TradeStats>>(new Map());
  const agentSessionsRef = useRef<
    Map<string, { id: string; modelId: string; modelName: string }>
  >(new Map());
  const sharpeRatiosRef = useRef<Map<string, number | null>>(new Map());

  // Calculate leaderboard entries from sessions and trade stats
  const calculateLeaderboard = useCallback(
    (
      sessions: AgentSessionRow[],
      tradeStats: Map<string, TradeStats>,
      sharpeRatios: Map<string, number | null>
    ): LeaderboardEntry[] => {
      // Sort by current_value descending for ranking
      const sorted = [...sessions].sort(
        (a, b) => b.current_value - a.current_value
      );

      return sorted.map((session, index) => {
        const model = MODELS.find((m) => m.id === session.model_id);
        const stats = tradeStats.get(session.id);

        // Calculate inference cost using model pricing
        const avgPrice = model
          ? (model.pricing.prompt + model.pricing.completion) / 2
          : 1;
        const inferenceCost =
          ((session.total_tokens || 0) * avgPrice) / 1_000_000;

        // Win rate calculation
        const winRate =
          stats && stats.tradesWithPnl > 0
            ? (stats.wins / stats.tradesWithPnl) * 100
            : 0;

        return {
          modelId: session.model_id,
          modelName: model?.name || session.model_name,
          chartColor: model?.chartColor || "#6366f1",
          series: model?.series,
          rank: index + 1,
          accountValue: session.current_value,
          returnPercent:
            ((session.current_value - session.starting_capital) /
              session.starting_capital) *
            100,
          totalPnL: session.current_value - session.starting_capital,
          totalTrades: stats?.totalTrades || 0,
          winRate,
          biggestWin: stats?.biggestWin || null,
          biggestLoss: stats?.biggestLoss || null,
          totalInferenceCost: inferenceCost,
          sharpeRatio: sharpeRatios.get(session.id) ?? null,
        };
      });
    },
    []
  );

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !sessionId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch agent sessions
        const { data: sessions, error: sessionsError } = await client
          .from("agent_sessions")
          .select(
            "id, model_id, model_name, starting_capital, current_value, total_tokens"
          )
          .eq("session_id", sessionId);

        if (sessionsError) throw new Error(sessionsError.message);

        // Build agent sessions map
        const sessionsMap = new Map<
          string,
          { id: string; modelId: string; modelName: string }
        >();
        for (const s of (sessions as AgentSessionRow[]) || []) {
          sessionsMap.set(s.id, {
            id: s.id,
            modelId: s.model_id,
            modelName: s.model_name,
          });
        }
        agentSessionsRef.current = sessionsMap;

        const sessionIds = (sessions as AgentSessionRow[])?.map((s) => s.id) || [];

        // 2. Fetch trade stats
        const { data: trades, error: tradesError } = await client
          .from("agent_trades")
          .select("agent_session_id, pnl")
          .in("agent_session_id", sessionIds);

        if (tradesError) {
          console.error("[useLeaderboard] Trade fetch error:", tradesError);
        }

        // Build trade stats map
        const tradeStatsMap = new Map<string, TradeStats>();
        for (const trade of (trades as Array<{
          agent_session_id: string;
          pnl: number | null;
        }>) || []) {
          const sid = trade.agent_session_id;
          if (!tradeStatsMap.has(sid)) {
            tradeStatsMap.set(sid, {
              totalTrades: 0,
              wins: 0,
              tradesWithPnl: 0,
              biggestWin: null,
              biggestLoss: null,
            });
          }

          const stats = tradeStatsMap.get(sid)!;
          stats.totalTrades++;

          if (trade.pnl !== null) {
            stats.tradesWithPnl++;
            if (trade.pnl > 0) {
              stats.wins++;
              stats.biggestWin =
                stats.biggestWin === null
                  ? trade.pnl
                  : Math.max(stats.biggestWin, trade.pnl);
            } else if (trade.pnl < 0) {
              stats.biggestLoss =
                stats.biggestLoss === null
                  ? trade.pnl
                  : Math.min(stats.biggestLoss, trade.pnl);
            }
          }
        }
        tradeStatsRef.current = tradeStatsMap;

        // 3. Fetch decisions for Sharpe ratio calculation
        const { data: decisions, error: decisionsError } = await client
          .from("agent_decisions")
          .select("agent_session_id, portfolio_value_after, created_at")
          .in("agent_session_id", sessionIds)
          .order("created_at", { ascending: true });

        if (decisionsError) {
          console.error(
            "[useLeaderboard] Decisions fetch error:",
            decisionsError
          );
        }

        // Calculate Sharpe ratios per agent
        const sharpeRatiosMap = new Map<string, number | null>();
        const decisionsByAgent = new Map<
          string,
          Map<string, number>
        >();

        for (const d of (decisions as Array<{
          agent_session_id: string;
          portfolio_value_after: number;
          created_at: string;
        }>) || []) {
          if (!decisionsByAgent.has(d.agent_session_id)) {
            decisionsByAgent.set(d.agent_session_id, new Map());
          }
          // Group by day (use last value per day)
          const day = new Date(d.created_at).toISOString().split("T")[0];
          decisionsByAgent.get(d.agent_session_id)!.set(day, d.portfolio_value_after);
        }

        for (const [agentId, dailyValues] of decisionsByAgent) {
          sharpeRatiosMap.set(agentId, calculateSharpeFromValues(dailyValues));
        }
        sharpeRatiosRef.current = sharpeRatiosMap;

        // Calculate leaderboard
        const leaderboard = calculateLeaderboard(
          (sessions as AgentSessionRow[]) || [],
          tradeStatsMap,
          sharpeRatiosMap
        );
        setEntries(leaderboard);
        setLastUpdated(new Date());
      } catch (err) {
        console.error("[useLeaderboard] Error:", err);
        setError(
          err instanceof Error ? err : new Error("Failed to fetch leaderboard")
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Set up real-time subscriptions
    const channel = client
      .channel(`leaderboard:${sessionId}`)
      // Listen for agent_sessions updates (balance changes)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_sessions",
        },
        (payload: RealtimePostgresUpdatePayload<Record<string, unknown>>) => {
          const sessionIdFromPayload = payload.new.session_id as string;
          if (sessionIdFromPayload !== sessionId) return;

          // Refetch all data for simplicity (ensures rankings are correct)
          fetchData();
        }
      )
      // Listen for new trades (updates win rate, trade count, etc.)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_trades",
        },
        (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
          const agentSessionId = payload.new.agent_session_id as string;
          const session = agentSessionsRef.current.get(agentSessionId);
          if (!session) return;

          // Update trade stats incrementally
          const pnl = payload.new.pnl as number | null;
          const stats = tradeStatsRef.current.get(agentSessionId) || {
            totalTrades: 0,
            wins: 0,
            tradesWithPnl: 0,
            biggestWin: null,
            biggestLoss: null,
          };

          stats.totalTrades++;
          if (pnl !== null) {
            stats.tradesWithPnl++;
            if (pnl > 0) {
              stats.wins++;
              stats.biggestWin =
                stats.biggestWin === null
                  ? pnl
                  : Math.max(stats.biggestWin, pnl);
            } else if (pnl < 0) {
              stats.biggestLoss =
                stats.biggestLoss === null
                  ? pnl
                  : Math.min(stats.biggestLoss, pnl);
            }
          }
          tradeStatsRef.current.set(agentSessionId, stats);

          // Update entries with new trade stats
          setEntries((prev) => {
            return prev.map((entry) => {
              if (entry.modelId === session.modelId) {
                const winRate =
                  stats.tradesWithPnl > 0
                    ? (stats.wins / stats.tradesWithPnl) * 100
                    : 0;
                return {
                  ...entry,
                  totalTrades: stats.totalTrades,
                  winRate,
                  biggestWin: stats.biggestWin,
                  biggestLoss: stats.biggestLoss,
                };
              }
              return entry;
            });
          });
          setLastUpdated(new Date());
        }
      )
      .subscribe((status: string) => {
        console.log(`[useLeaderboard] Subscription status: ${status}`);
      });

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId, calculateLeaderboard]);

  return { entries, loading, error, lastUpdated };
}
