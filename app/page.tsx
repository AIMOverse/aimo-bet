"use client";

import { ChatInterface } from "@/components/chat";
import { useSessions } from "@/hooks/chat";
import { useSessionHydration } from "@/store/sessionStore";

export default function Home() {
  const hasHydrated = useSessionHydration();
  const { currentSession } = useSessions();

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
      sessionId={currentSession?.id ?? null}
      sessionTitle={currentSession?.title}
    />
  );
}
