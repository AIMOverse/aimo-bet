"use client";

import { useMemo, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Loader2, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/chat/useChat";
import { MODELS } from "@/lib/ai/models";
import type { ChatMessage as ChatMessageType } from "@/lib/supabase/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getModelSeriesIcon,
  type ModelSeriesIconResult,
} from "@/components/icons/model-series";

// Format time ago
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="prose prose-sm prose-slate max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => (
            <h1 className="text-lg font-semibold mt-4 mb-2" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-base font-semibold mt-3 mb-2" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-sm font-semibold mt-2 mb-1" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="my-2 leading-relaxed" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="my-2 ml-4 list-disc space-y-1" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1" {...props} />
          ),
          li: ({ ...props }) => <li className="text-sm" {...props} />,
          a: ({ ...props }) => (
            <a className="text-blue-500 hover:underline" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold" {...props} />
          ),
          em: ({ ...props }) => <em className="italic" {...props} />,
          blockquote: ({ ...props }) => (
            <blockquote
              className="border-l-2 border-muted-foreground pl-3 my-2 text-muted-foreground"
              {...props}
            />
          ),
          code: (props) => {
            const inline = !props.className;
            return inline ? (
              <code
                className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono"
                {...props}
              />
            ) : (
              <code
                className="block px-3 py-2 rounded bg-muted text-xs font-mono overflow-x-auto my-2"
                {...props}
              />
            );
          },
          pre: ({ ...props }) => (
            <pre
              className="rounded-lg bg-muted/50 p-3 overflow-x-auto my-2"
              {...props}
            />
          ),
          table: ({ ...props }) => (
            <div className="my-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-border" {...props} />
            </div>
          ),
          thead: ({ ...props }) => <thead className="bg-muted/30" {...props} />,
          th: ({ ...props }) => (
            <th
              className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider"
              {...props}
            />
          ),
          td: ({ ...props }) => (
            <td className="px-3 py-2 text-sm whitespace-nowrap" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function MessageBubble({
  message,
  modelInfo,
}: {
  message: ChatMessageType;
  modelInfo?: { name: string; color: string; icon: ModelSeriesIconResult };
}) {
  const text = message.parts?.find((p) => p.type === "text")?.text ?? "";
  const createdAt = message.metadata?.createdAt ?? 0;
  const name = modelInfo?.name ?? "Model";
  const color = modelInfo?.color ?? "#6366f1";
  const icon = modelInfo?.icon;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex gap-3 p-3 rounded-lg bg-muted/30">
      <Avatar
        className="size-7 ring-[1.5px] ring-offset-0 bg-background shrink-0"
        style={{ ["--tw-ring-color" as string]: color }}
      >
        {icon?.type === "component" ? (
          <icon.Component className="size-full p-1" />
        ) : icon?.type === "image" ? (
          <>
            <AvatarImage
              src={icon.src}
              alt={`${name} logo`}
              className="p-0.5"
            />
            <AvatarFallback
              className="text-[10px] font-semibold text-foreground"
              style={{ backgroundColor: `${color}20` }}
            >
              {initial}
            </AvatarFallback>
          </>
        ) : (
          <AvatarFallback
            className="text-[10px] font-semibold text-foreground"
            style={{ backgroundColor: `${color}20` }}
          >
            {initial}
          </AvatarFallback>
        )}
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{name}</span>
          <span className="text-xs text-muted-foreground">
            {formatTimeAgo(createdAt)}
          </span>
        </div>
        <MarkdownContent>{text}</MarkdownContent>
      </div>
    </div>
  );
}

interface ChatInterfaceProps {
  sessionId: string | null;
  selectedModelId?: string | null;
}

export function ChatInterface({
  sessionId,
  selectedModelId = null,
}: ChatInterfaceProps) {
  // Pass modelId to hook for server-side filtering
  const { messages, isLoading, isLoadingMore, hasMore, error, loadMore } =
    useChat({
      sessionId,
      modelId: selectedModelId,
    });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevMessagesLengthRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const isLoadingOlderRef = useRef<boolean>(false);

  // Reversed messages for display (oldest first, newest at bottom)
  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Model info lookup map from catalog (includes icon derived from series)
  const modelInfoMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; color: string; icon: ModelSeriesIconResult }
    >();
    for (const model of MODELS) {
      if (model.chartColor) {
        map.set(model.id, {
          name: model.name,
          color: model.chartColor,
          icon: getModelSeriesIcon(model.series),
        });
      }
    }
    return map;
  }, []);

  // Get the scroll viewport element from ScrollArea
  const getScrollViewport = useCallback(() => {
    return scrollContainerRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLDivElement | null;
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    const viewport = getScrollViewport();
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [getScrollViewport]);

  // Check if user is near bottom
  const isNearBottom = useCallback(() => {
    const viewport = getScrollViewport();
    if (!viewport) return true;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    return scrollHeight - scrollTop - clientHeight < 100;
  }, [getScrollViewport]);

  // Handle loading older messages - preserve scroll position
  const handleLoadOlder = useCallback(async () => {
    const viewport = getScrollViewport();
    if (viewport) {
      prevScrollHeightRef.current = viewport.scrollHeight;
      isLoadingOlderRef.current = true;
    }
    await loadMore();
  }, [loadMore, getScrollViewport]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading && messages.length > 0 && isInitialLoadRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        scrollToBottom();
        isInitialLoadRef.current = false;
      }, 0);
    }
  }, [isLoading, messages.length, scrollToBottom]);

  // Reset initial load flag when session changes
  useEffect(() => {
    isInitialLoadRef.current = true;
  }, [sessionId, selectedModelId]);

  // Handle scroll position after loading older messages OR auto-scroll on new messages
  useEffect(() => {
    const viewport = getScrollViewport();
    if (!viewport) return;

    if (isLoadingOlderRef.current && !isLoadingMore) {
      // Finished loading older messages - restore scroll position
      const newScrollHeight = viewport.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
      viewport.scrollTop = scrollDiff;
      isLoadingOlderRef.current = false;
    } else if (
      messages.length > prevMessagesLengthRef.current &&
      !isInitialLoadRef.current
    ) {
      // New message arrived via realtime - scroll to bottom if near bottom
      if (isNearBottom()) {
        setTimeout(() => scrollToBottom(), 0);
      }
    }

    prevMessagesLengthRef.current = messages.length;
  }, [
    messages.length,
    isLoadingMore,
    getScrollViewport,
    isNearBottom,
    scrollToBottom,
  ]);

  if (!sessionId) {
    return (
      <Card className="h-full flex flex-col">
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
      <CardContent className="flex-1 min-h-0 pt-4">
        <ScrollArea className="h-full pr-4" ref={scrollContainerRef}>
          <div className="flex flex-col">
            {/* Loading spinner for initial load */}
            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {error ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="h-12 w-12 text-destructive/50 mb-4" />
                <p className="text-destructive">Failed to load messages</p>
              </div>
            ) : displayMessages.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No messages yet</p>
              </div>
            ) : (
              <>
                {/* Load older button at top */}
                {hasMore && !isLoading && (
                  <div className="flex justify-center pb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLoadOlder}
                      disabled={isLoadingMore}
                      className="h-8 text-xs text-muted-foreground"
                    >
                      {isLoadingMore ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 mr-1" />
                      )}
                      Load older messages
                    </Button>
                  </div>
                )}

                {/* Messages - oldest first, newest at bottom */}
                <div className="space-y-3">
                  {displayMessages.map((msg: ChatMessageType) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      modelInfo={modelInfoMap.get(msg.metadata?.authorId ?? "")}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
