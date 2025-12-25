"use client";

import {
  BarChart3,
  ArrowRightLeft,
  MessageCircle,
  User,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ChatMessage as ChatMessageType,
  ChatMessageType as MessageType,
} from "@/types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  modelInfo?: {
    name: string;
    color: string;
  };
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

// Get icon for message type
function MessageTypeIcon({ type }: { type: MessageType }) {
  switch (type) {
    case "analysis":
      return <BarChart3 className="h-4 w-4" />;
    case "trade":
      return <ArrowRightLeft className="h-4 w-4" />;
    case "commentary":
      return <MessageCircle className="h-4 w-4" />;
    case "user":
      return <User className="h-4 w-4" />;
    case "assistant":
      return <Bot className="h-4 w-4" />;
    default:
      return <MessageCircle className="h-4 w-4" />;
  }
}

// Get badge style for message type
function getTypeBadgeStyle(type: MessageType): string {
  switch (type) {
    case "analysis":
      return "bg-blue-500/10 text-blue-500";
    case "trade":
      return "bg-green-500/10 text-green-500";
    case "commentary":
      return "bg-purple-500/10 text-purple-500";
    case "user":
      return "bg-orange-500/10 text-orange-500";
    case "assistant":
      return "bg-indigo-500/10 text-indigo-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Get background style based on author type
function getMessageBackground(authorType: string): string {
  switch (authorType) {
    case "model":
      return "bg-muted/30";
    case "user":
      return "bg-primary/10 ml-8";
    case "assistant":
      return "bg-secondary/20";
    default:
      return "bg-muted/30";
  }
}

// Extract text content from message parts
function getMessageText(message: ChatMessageType): string {
  if (!message.parts) return "";

  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

// Get author display name
function getAuthorName(
  authorType: string,
  authorId: string,
  modelInfo?: { name: string; color: string },
): string {
  switch (authorType) {
    case "model":
      return modelInfo?.name ?? "Model";
    case "user":
      return "You";
    case "assistant":
      return "Arena Assistant";
    default:
      return "Unknown";
  }
}

// Get author avatar color
function getAvatarColor(
  authorType: string,
  modelInfo?: { name: string; color: string },
): string {
  switch (authorType) {
    case "model":
      return modelInfo?.color ?? "#6366f1";
    case "user":
      return "#f97316"; // orange-500
    case "assistant":
      return "#8b5cf6"; // violet-500
    default:
      return "#6366f1";
  }
}

export function ChatMessage({ message, modelInfo }: ChatMessageProps) {
  const metadata = message.metadata;
  const authorType = metadata?.authorType ?? "assistant";
  const messageType = metadata?.messageType ?? "assistant";
  // Use 0 as fallback - createdAt should always be set by the time messages are saved
  const createdAt = metadata?.createdAt ?? 0;

  const authorName = getAuthorName(
    authorType,
    metadata?.authorId ?? "",
    modelInfo,
  );
  const avatarColor = getAvatarColor(authorType, modelInfo);
  const bgStyle = getMessageBackground(authorType);
  const badgeStyle = getTypeBadgeStyle(messageType);
  const content = getMessageText(message);

  const isModel = authorType === "model";

  return (
    <div
      className={cn(
        "p-4 rounded-lg hover:bg-opacity-80 transition-colors",
        bgStyle,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {authorName.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="font-medium text-sm block">{authorName}</span>
            <span className="text-xs text-muted-foreground">
              {formatTimeAgo(createdAt)}
            </span>
          </div>
        </div>

        {/* Only show type badge for model messages */}
        {isModel && (
          <span
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
              badgeStyle,
            )}
          >
            <MessageTypeIcon type={messageType} />
            {messageType}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
