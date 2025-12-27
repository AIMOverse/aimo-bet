"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseRealtimeMessagesOptions {
  /** Trading session ID to subscribe to */
  sessionId: string | null;
  /** Callback when a new message arrives */
  onMessage: (message: ChatMessage) => void;
}

/**
 * Subscribe to realtime chat message inserts for a session.
 * Used to receive agent trade broadcasts instantly.
 */
export function useRealtimeMessages({
  sessionId,
  onMessage,
}: UseRealtimeMessagesOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep callback ref updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) {
      console.warn("[realtime:chat] Supabase client not configured");
      return;
    }

    console.log(`[realtime:chat] Subscribing to session: ${sessionId}`);

    const channel = client
      .channel(`chat:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "arena_chat_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;

          const message: ChatMessage = {
            id: row.id as string,
            role: row.role as "user" | "assistant",
            parts: row.parts as ChatMessage["parts"],
            metadata: row.metadata as ChatMessage["metadata"],
          };

          console.log(
            `[realtime:chat] New message from ${message.metadata?.authorId}`,
          );
          onMessageRef.current(message);
        },
      )
      .subscribe((status) => {
        console.log(`[realtime:chat] Subscription status: ${status}`);
      });

    channelRef.current = channel;

    return () => {
      console.log(`[realtime:chat] Unsubscribing from session: ${sessionId}`);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId]);
}
