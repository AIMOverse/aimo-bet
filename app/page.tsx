"use client";

import { ChatInterface, ChatSidebar } from "@/components/chat";
import { useSessions } from "@/hooks/chat";
import { useSessionHydration } from "@/store/sessionStore";
import { useCallback } from "react";

export default function Home() {
  const hasHydrated = useSessionHydration();
  const {
    sessions,
    currentSession,
    isLoading,
    createSession,
    deleteSession,
    setCurrentSession,
  } = useSessions();

  const handleNewChat = useCallback(async () => {
    await createSession();
  }, [createSession]);

  // Wait for hydration to avoid SSR mismatch
  if (!hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <ChatSidebar
        sessions={sessions}
        currentSessionId={currentSession?.id ?? null}
        isLoading={isLoading}
        onSelectSession={setCurrentSession}
        onNewChat={handleNewChat}
        onDeleteSession={deleteSession}
      />

      {/* Main Chat Area */}
      <main className="flex-1">
        <ChatInterface sessionId={currentSession?.id ?? null} />
      </main>
    </div>
  );
}
