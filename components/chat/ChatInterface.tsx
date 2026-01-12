"use client";

import { useMemo, useEffect, useRef } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useChat } from "@/hooks/chat/useChat";
import { MODELS } from "@/lib/ai/models";
import type { ChatMessage as ChatMessageType } from "@/lib/supabase/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Map series to logo filename
const SERIES_LOGO_MAP: Record<string, string> = {
  openai: "openai.svg",
  claude: "claude-color.svg",
  gemini: "gemini-color.svg",
  deepseek: "deepseek-color.svg",
  qwen: "qwen-color.svg",
  grok: "grok.svg",
  kimi: "kimi-color.svg",
  glm: "zai.svg",
};

function getLogoPathFromSeries(series?: string): string | undefined {
  if (!series) return undefined;
  const filename = SERIES_LOGO_MAP[series];
  return filename ? `/model-series/${filename}` : undefined;
}

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
          li: ({ ...props }) => (
            <li className="text-sm" {...props} />
          ),
          a: ({ ...props }) => (
            <a className="text-blue-500 hover:underline" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-2 border-muted-foreground pl-3 my-2 text-muted-foreground" {...props} />
          ),
          code: (props) => {
            const inline = !props.className;
            return inline ? (
              <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono" {...props} />
            ) : (
              <code className="block px-3 py-2 rounded bg-muted text-xs font-mono overflow-x-auto my-2" {...props} />
            );
          },
          pre: ({ ...props }) => (
            <pre className="rounded-lg bg-muted/50 p-3 overflow-x-auto my-2" {...props} />
          ),
          table: ({ ...props }) => (
            <div className="my-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-border" {...props} />
            </div>
          ),
          thead: ({ ...props }) => (
            <thead className="bg-muted/30" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" {...props} />
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
  modelInfo?: { name: string; color: string; logoPath?: string };
}) {
  const text = message.parts?.find((p) => p.type === "text")?.text ?? "";
  const createdAt = message.metadata?.createdAt ?? 0;
  const name = modelInfo?.name ?? "Model";
  const color = modelInfo?.color ?? "#6366f1";
  const logoPath = modelInfo?.logoPath;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex gap-3 p-3 rounded-lg bg-muted/30">
      <Avatar
        className="size-7 ring-[1.5px] ring-offset-0 bg-background shrink-0"
        style={{ ["--tw-ring-color" as string]: color }}
      >
        {logoPath ? (
          <AvatarImage src={logoPath} alt={`${name} logo`} className="p-0.5" />
        ) : null}
        <AvatarFallback
          className="text-[10px] font-semibold text-foreground"
          style={{ backgroundColor: `${color}20` }}
        >
          {initial}
        </AvatarFallback>
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
  const { messages, isLoading, error } = useChat({ sessionId });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Model info lookup map from catalog (includes logoPath derived from series)
  const modelInfoMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; color: string; logoPath?: string }
    >();
    for (const model of MODELS) {
      if (model.chartColor) {
        map.set(model.id, {
          name: model.name,
          color: model.chartColor,
          logoPath: getLogoPathFromSeries(model.series),
        });
      }
    }
    return map;
  }, []);

  // Filter by selected model
  const filteredMessages = useMemo(() => {
    if (!selectedModelId) return messages;
    return messages.filter(
      (msg: ChatMessageType) => msg.metadata?.authorId === selectedModelId
    );
  }, [messages, selectedModelId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredMessages.length]);

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
      <CardHeader className="pb-3">
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4" ref={scrollRef}>
          {error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-12 w-12 text-destructive/50 mb-4" />
              <p className="text-destructive">Failed to load messages</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMessages.map((msg: ChatMessageType) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  modelInfo={modelInfoMap.get(msg.metadata?.authorId ?? "")}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
