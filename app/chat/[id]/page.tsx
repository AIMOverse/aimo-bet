"use client";

import { ChatInterface, ChatSidebar } from "@/components/chat";
import { useSessions } from "@/hooks/chat";
import { useSessionStore, useSessionHydration } from "@/store/sessionStore";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const hasHydrated = useSessionHydration();
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);

  const {
    sessions,
    currentSession,
    isLoading,
    createSession,
    deleteSession,
    setCurrentSession: selectSession,
  } = useSessions();

  // Sync URL param with store
  useEffect(() => {
    if (hasHydrated && sessionId) {
      setCurrentSession(sessionId);
    }
  }, [sessionId, hasHydrated, setCurrentSession]);

  const handleNewChat = useCallback(async () => {
    const session = await createSession();
    router.push(`/chat/${session.id}`);
  }, [createSession, router]);

  const handleSelectSession = useCallback(
    (id: string) => {
      selectSession(id);
      router.push(`/chat/${id}`);
    },
    [selectSession, router]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      // If deleting current session, navigate to home
      if (id === sessionId) {
        router.push("/");
      }
    },
    [deleteSession, sessionId, router]
  );

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
        currentSessionId={sessionId}
        isLoading={isLoading}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
      />

      {/* Main Chat Area */}
      <main className="flex-1">
        <ChatInterface sessionId={sessionId} />
      </main>
    </div>
  );
}
