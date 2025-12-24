"use client";

import { useMemo, useEffect, useRef } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useArenaChatMessages } from "@/hooks/chat";
import type { ArenaModel } from "@/types/arena";

interface ModelChatFeedProps {
  /** Trading session ID */
  sessionId: string | null;
  /** Currently selected model for filtering (null = show all) */
  selectedModelId?: string | null;
  /** All arena models for display info */
  models?: ArenaModel[];
}

export function ModelChatFeed({
  sessionId,
  selectedModelId = null,
  models = [],
}: ModelChatFeedProps) {
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    input,
    setInput,
  } = useArenaChatMessages({
    sessionId,
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Create a map of model info for quick lookup
  const modelInfoMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const model of models) {
      map.set(model.id, {
        name: model.name,
        color: model.chartColor,
      });
    }
    return map;
  }, [models]);

  // Filter by model if selected
  const filteredMessages = useMemo(() => {
    if (!selectedModelId) return messages;
    return messages.filter((msg) => {
      // Show all non-model messages (user, assistant)
      if (msg.metadata?.authorType !== "model") return true;
      // Filter model messages by selected model
      return msg.metadata?.authorId === selectedModelId;
    });
  }, [messages, selectedModelId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredMessages.length]);

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput("");
    }
  };

  // Show placeholder if no session
  if (!sessionId) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" />
            Model Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a trading session to view chat</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Model Chat
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4" ref={scrollRef}>
          {error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-12 w-12 text-destructive/50 mb-4" />
              <p className="text-destructive">Failed to load messages</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No messages yet</p>
              <p className="text-sm text-muted-foreground/70">
                Model analysis and commentary will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  modelInfo={
                    msg.metadata?.authorType === "model"
                      ? modelInfoMap.get(msg.metadata.authorId)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <CardFooter className="pt-3 border-t">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={isLoading || !sessionId}
        />
      </CardFooter>
    </Card>
  );
}
