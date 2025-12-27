"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { PerformanceSnapshot } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseRealtimePerformanceOptions {
  /** Trading session ID to subscribe to */
  sessionId: string | null;
  /** Callback when a new snapshot arrives */
  onSnapshot: (snapshot: PerformanceSnapshot) => void;
}

/**
 * Subscribe to realtime performance snapshot inserts for a session.
 * Provides instant chart updates when cron saves new snapshots.
 */
export function useRealtimePerformance({
  sessionId,
  onSnapshot,
}: UseRealtimePerformanceOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onSnapshotRef = useRef(onSnapshot);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) {
      console.warn("[realtime:performance] Supabase client not configured");
      return;
    }

    console.log(`[realtime:performance] Subscribing to session: ${sessionId}`);

    const channel = client
      .channel(`performance:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "performance_snapshots",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;

          const snapshot: PerformanceSnapshot = {
            id: row.id as string,
            sessionId: row.session_id as string,
            modelId: row.model_id as string,
            accountValue: Number(row.account_value),
            timestamp: new Date(row.timestamp as string),
          };

          console.log(
            `[realtime:performance] New snapshot for ${snapshot.modelId}`,
          );
          onSnapshotRef.current(snapshot);
        },
      )
      .subscribe((status) => {
        console.log(`[realtime:performance] Subscription status: ${status}`);
      });

    channelRef.current = channel;

    return () => {
      console.log(
        `[realtime:performance] Unsubscribing from session: ${sessionId}`,
      );
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId]);
}
