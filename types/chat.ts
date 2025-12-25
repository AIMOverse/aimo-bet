import type { UIMessage } from "ai";

// =============================================================================
// Arena Chat Types
// =============================================================================

/**
 * Author types for arena chat messages
 */
export type ArenaChatAuthorType = "model" | "user" | "assistant";

/**
 * Message types for arena chat
 */
export type ArenaChatMessageType =
  | "analysis"
  | "trade"
  | "commentary"
  | "user"
  | "assistant";

/**
 * Custom metadata for arena chat messages.
 * Follows ai-sdk patterns by extending UIMessage with typed metadata.
 */
export interface ArenaChatMetadata {
  /** Trading session ID (trading_sessions.id) */
  sessionId: string;
  /** Who authored the message */
  authorType: ArenaChatAuthorType;
  /** Identifier for the author (model_id, visitorIP, or 'assistant') */
  authorId: string;
  /** Type of message content */
  messageType: ArenaChatMessageType;
  /** Related trade ID if this is a trade message */
  relatedTradeId?: string;
  /** Timestamp in milliseconds */
  createdAt: number;
}

/**
 * Arena chat message = UIMessage with our custom metadata
 */
export type ArenaChatMessage = UIMessage & {
  metadata?: ArenaChatMetadata;
};

/**
 * Author display information for rendering
 */
export interface ArenaChatAuthor {
  name: string;
  avatarUrl?: string;
  color?: string;
}

/**
 * Arena chat message with author display info for rendering
 */
export interface ArenaChatMessageWithAuthor extends ArenaChatMessage {
  author: ArenaChatAuthor;
}
