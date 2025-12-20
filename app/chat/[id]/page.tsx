"use client";

import { ChatInterface } from "@/components/chat";
import { AppHeader } from "@/components/layout/AppHeader";
import { useChatStore } from "@/store/chatStore";
import { useParams } from "next/navigation";
import { useEffect } from "react";

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const setCurrentSession = useChatStore((s) => s.setCurrentSession);

  // Sync URL param with store
  useEffect(() => {
    if (sessionId) {
      setCurrentSession(sessionId);
    }
  }, [sessionId, setCurrentSession]);

  return (
    <>
      <AppHeader />
      <ChatInterface sessionId={sessionId} />
    </>
  );
}
