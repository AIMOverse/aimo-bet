"use client";

import { ChatInterface } from "@/components/chat";
import { useSessions } from "@/hooks/chat";
import { useSessionStore, useSessionHydration } from "@/store/sessionStore";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const hasHydrated = useSessionHydration();
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);
  const { sessions } = useSessions();

  // Find current session to get title
  const currentSession = useMemo(
    () => sessions.find((s) => s.id === sessionId),
    [sessions, sessionId]
  );

  // Sync URL param with store
  useEffect(() => {
    if (hasHydrated && sessionId) {
      setCurrentSession(sessionId);
    }
  }, [sessionId, hasHydrated, setCurrentSession]);

  // Wait for hydration to avoid SSR mismatch
  if (!hasHydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <ChatInterface
      sessionId={sessionId}
      sessionTitle={currentSession?.title}
    />
  );
}
