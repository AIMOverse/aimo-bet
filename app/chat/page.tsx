"use client";

import { ChatInterface } from "@/components/chat";
import { AppHeader } from "@/components/layout/AppHeader";

/**
 * New chat page - no session ID yet.
 * Session will be created server-side on first message.
 */
export default function ChatPage() {
  return (
    <>
      <AppHeader />
      <ChatInterface sessionId={null} />
    </>
  );
}
