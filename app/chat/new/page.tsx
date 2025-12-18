"use client";

import { ChatInterface } from "@/components/chat";
import { useSessionHydration } from "@/store/sessionStore";

/**
 * New chat page - no session ID yet.
 * Session will be created server-side on first message.
 */
export default function NewChatPage() {
  const hasHydrated = useSessionHydration();

  // Wait for hydration to avoid SSR mismatch
  if (!hasHydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <ChatInterface sessionId={null} sessionTitle="New Chat" />;
}
