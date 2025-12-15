"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/types/chat";
import {
  MessageSquarePlusIcon,
  TrashIcon,
  MessageSquareIcon,
} from "lucide-react";
import { memo } from "react";

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoading?: boolean;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
}

export const ChatSidebar = memo(function ChatSidebar({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}: ChatSidebarProps) {
  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="text-sm font-semibold">Chats</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNewChat}
          title="New Chat"
        >
          <MessageSquarePlusIcon className="size-4" />
        </Button>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No chats yet
            </div>
          ) : (
            sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
                onSelect={() => onSelectSession(session.id)}
                onDelete={() => onDeleteSession(session.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const SessionItem = memo(function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: SessionItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
        isActive && "bg-accent"
      )}
      onClick={onSelect}
    >
      <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{session.title}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
      >
        <TrashIcon className="size-3.5" />
      </Button>
    </div>
  );
});
