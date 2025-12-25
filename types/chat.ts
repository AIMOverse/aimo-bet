import type { UIMessage } from "ai";

// =============================================================================
// Chat Types
// =============================================================================

/**
 * Author types for chat messages
 */
export type ChatAuthorType = "model" | "user" | "assistant";

/**
 * Message types for chat
 */
export type ChatMessageType =
  | "analysis"
  | "trade"
  | "commentary"
  | "user"
  | "assistant";

/**
 * Custom metadata for chat messages.
 * Follows ai-sdk patterns by extending UIMessage with typed metadata.
 */
export interface ChatMetadata {
  /** Trading session ID (trading_sessions.id) */
  sessionId: string;
  /** Who authored the message */
  authorType: ChatAuthorType;
  /** Identifier for the author (model_id, visitorIP, or 'assistant') */
  authorId: string;
  /** Type of message content */
  messageType: ChatMessageType;
  /** Related trade ID if this is a trade message */
  relatedTradeId?: string;
  /** Timestamp in milliseconds */
  createdAt: number;
}

/**
 * Chat message = UIMessage with our custom metadata
 */
export type ChatMessage = UIMessage & {
  metadata?: ChatMetadata;
};

/**
 * Author display information for rendering
 */
export interface ChatAuthor {
  name: string;
  avatarUrl?: string;
  color?: string;
}

/**
 * Chat message with author display info for rendering
 */
export interface ChatMessageWithAuthor extends ChatMessage {
  author: ChatAuthor;
}
