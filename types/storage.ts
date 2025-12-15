import type { ChatSession, PersistedMessage, AppUIMessage } from "./chat";

// =============================================================================
// Storage Adapter Interface
// =============================================================================

/**
 * Unified storage adapter interface.
 * Implementations: localStorage, Supabase
 */
export interface StorageAdapter {
  /** Adapter identifier */
  readonly type: "local" | "supabase";

  // =========================================================================
  // Session Operations
  // =========================================================================

  /**
   * Get all chat sessions, ordered by updatedAt descending
   */
  getSessions(): Promise<ChatSession[]>;

  /**
   * Get a single session by ID
   */
  getSession(id: string): Promise<ChatSession | null>;

  /**
   * Create a new session
   */
  createSession(session: Omit<ChatSession, "id" | "createdAt" | "updatedAt">): Promise<ChatSession>;

  /**
   * Update an existing session
   */
  updateSession(id: string, data: Partial<Pick<ChatSession, "title" | "modelId">>): Promise<void>;

  /**
   * Delete a session and all its messages
   */
  deleteSession(id: string): Promise<void>;

  // =========================================================================
  // Message Operations
  // =========================================================================

  /**
   * Get all messages for a session, ordered by createdAt ascending
   */
  getMessages(sessionId: string): Promise<PersistedMessage[]>;

  /**
   * Add a message to a session
   */
  addMessage(sessionId: string, message: AppUIMessage, model?: string): Promise<void>;

  /**
   * Update a message (e.g., for streaming completion)
   */
  updateMessage(
    sessionId: string,
    messageId: string,
    data: Partial<Pick<PersistedMessage, "content" | "parts" | "model">>
  ): Promise<void>;

  /**
   * Delete a specific message
   */
  deleteMessage(sessionId: string, messageId: string): Promise<void>;
}

// =============================================================================
// Storage Configuration
// =============================================================================

/**
 * Storage mode configuration
 */
export type StorageMode = "local" | "supabase";

/**
 * Get storage mode from environment
 */
export function getStorageMode(): StorageMode {
  const mode = process.env.NEXT_PUBLIC_STORAGE_MODE;
  if (mode === "supabase") return "supabase";
  return "local";
}
