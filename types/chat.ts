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

// =============================================================================
// Message Types
// =============================================================================

/**
 * App-specific metadata that can be attached to a UIMessage.
 */
export interface ChatMessageMetadata {
  /** ISO timestamp when the message was created */
  createdAt?: string;
  /** AI model that generated this message (assistant messages only) */
  model?: string;
  /** Timestamp when finished (for AI messages) */
  finishedAt?: number;
}

/**
 * Extended UIMessage type with additional app metadata
 */
export type AppUIMessage = UIMessage & {
  /** When the message was created */
  createdAt?: Date;
  /** AI model that generated this message (for persistence) */
  model?: string | null;
};

// =============================================================================
// Session Types
// =============================================================================

/**
 * Represents a single chat session with metadata.
 */
export interface ChatSession {
  /** Unique identifier for the session (UUID) */
  id: string;
  /** Title for the session */
  title: string;
  /** Model ID used in this session */
  modelId: string;
  /** Timestamp when the session was created */
  createdAt: Date;
  /** Timestamp when the session was last updated */
  updatedAt: Date;
}

/**
 * Serializable version of ChatSession for persistence.
 * Dates are stored as ISO strings.
 */
export interface PersistedChatSession {
  id: string;
  title: string;
  modelId: string;
  /** ISO string representation of creation timestamp */
  createdAt: string;
  /** ISO string representation of last update timestamp */
  updatedAt: string;
}

/**
 * Message stored in persistence layer
 */
export interface PersistedMessage {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant";
  content: string;
  /** AI SDK message parts for rich content */
  parts?: UIMessage["parts"];
  /** Optional attachments metadata */
  attachments?: MessageAttachment[];
  /** AI model that generated this message (assistant only) */
  model?: string | null;
  /** ISO timestamp */
  createdAt: string;
}

/**
 * Attachment metadata for messages
 */
export interface MessageAttachment {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** MIME type */
  contentType: string;
  /** URL to access the attachment */
  url: string;
  /** File size in bytes */
  size?: number;
}

// =============================================================================
// Conversion Helpers
// =============================================================================

/**
 * Convert persisted session to ChatSession
 */
export function toSession(persisted: PersistedChatSession): ChatSession {
  return {
    ...persisted,
    createdAt: new Date(persisted.createdAt),
    updatedAt: new Date(persisted.updatedAt),
  };
}

/**
 * Convert ChatSession to persisted format
 */
export function toPersistedSession(session: ChatSession): PersistedChatSession {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

/**
 * Convert persisted message to AppUIMessage
 */
export function toUIMessage(persisted: PersistedMessage): AppUIMessage {
  return {
    id: persisted.id,
    role: persisted.role,
    parts: persisted.parts ?? [{ type: "text", text: persisted.content }],
    createdAt: new Date(persisted.createdAt),
    model: persisted.model,
  };
}

/**
 * Convert AppUIMessage to persisted format
 */
export function toPersistedMessage(
  message: AppUIMessage,
  sessionId: string,
  model?: string
): PersistedMessage {
  // Extract text content from parts
  const content =
    message.parts
      ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("") ?? "";

  return {
    id: message.id,
    sessionId,
    role: message.role,
    content,
    parts: message.parts,
    model: model ?? message.model ?? null,
    createdAt: message.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
