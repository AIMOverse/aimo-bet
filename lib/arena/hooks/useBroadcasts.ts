"use client";

import useSWR from "swr";
import { fetchSessionBroadcasts, fetchModels } from "../api";
import { POLLING_INTERVALS } from "../constants";
import type { Broadcast, BroadcastWithModel, ArenaModel } from "@/types/arena";

/**
 * Hook to fetch broadcasts for a session with model info
 */
export function useBroadcasts(sessionId: string | null, limit = 50) {
  // Fetch broadcasts
  const {
    data: broadcasts,
    error: broadcastsError,
    isLoading: broadcastsLoading,
    mutate: mutateBroadcasts,
  } = useSWR<Broadcast[]>(
    sessionId ? `arena/broadcasts/${sessionId}/${limit}` : null,
    () => (sessionId ? fetchSessionBroadcasts(sessionId, limit) : []),
    {
      refreshInterval: POLLING_INTERVALS.broadcasts,
    }
  );

  // Fetch models for enrichment
  const {
    data: models,
    error: modelsError,
    isLoading: modelsLoading,
  } = useSWR<ArenaModel[]>("arena/models", () => fetchModels(false), {
    revalidateOnFocus: false,
  });

  // Create model lookup map
  const modelMap = new Map<string, ArenaModel>();
  models?.forEach((m) => modelMap.set(m.id, m));

  // Enrich broadcasts with model info
  const broadcastsWithModels: BroadcastWithModel[] = (broadcasts || []).map(
    (broadcast) => {
      const model = modelMap.get(broadcast.modelId) || {
        id: broadcast.modelId,
        name: "Unknown Model",
        provider: "Unknown",
        modelIdentifier: "unknown",
        chartColor: "#6366f1",
        enabled: true,
        createdAt: new Date(),
      };
      return { ...broadcast, model };
    }
  );

  return {
    broadcasts: broadcastsWithModels,
    isLoading: broadcastsLoading || modelsLoading,
    error: broadcastsError || modelsError,
    mutate: mutateBroadcasts,
  };
}
