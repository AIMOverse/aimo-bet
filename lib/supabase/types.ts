import type { UIMessage } from "ai";

// =============================================================================
// Database Row Types (exact match to table columns)
// =============================================================================

/**
 * chat_sessions table row
 * Note: No user_id - anonymous usage
 */
export interface DbChatSession {
  id: string; // UUID
  title: string;
  model_id: string;
  created_at: string; // TIMESTAMPTZ as ISO string
  updated_at: string; // TIMESTAMPTZ as ISO string
}

/**
 * chat_messages table row
 */
export interface DbChatMessage {
  id: string; // AI SDK nanoid
  session_id: string; // UUID foreign key
  role: "system" | "user" | "assistant";
  content: string; // Plain text content
  parts: UIMessage["parts"] | null; // JSONB - AI SDK message parts array
  attachments: DbAttachmentMeta[] | null; // JSONB - attachment metadata
  model: string | null; // AI model that generated this message
  created_at: string; // TIMESTAMPTZ as ISO string
}

/**
 * Attachment metadata stored in messages
 */
export interface DbAttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  url: string;
  size?: number;
}

// =============================================================================
// Library File Types
// =============================================================================

/**
 * Source type for library files
 */
export type FileSourceType = "chat" | "generated" | "uploaded";

/**
 * File type category for filtering
 */
export type FileCategory = "image" | "document" | "code" | "other";

/**
 * library_files table row
 */
export interface DbLibraryFile {
  id: string; // UUID
  name: string; // Display name
  storage_path: string; // Path in Supabase Storage
  content_type: string; // MIME type
  size: number; // File size in bytes
  source_type: FileSourceType; // Where the file came from
  source_id: string | null; // Session ID if from chat, generation ID if generated
  category: FileCategory; // Computed category for filtering
  created_at: string; // TIMESTAMPTZ as ISO string
}

/**
 * library_files insert type
 */
export interface DbLibraryFileInsert {
  id?: string;
  name: string;
  storage_path: string;
  content_type: string;
  size: number;
  source_type: FileSourceType;
  source_id?: string | null;
  category: FileCategory;
  created_at?: string;
}

// =============================================================================
// Insert Types
// =============================================================================

export interface DbChatSessionInsert {
  id?: string;
  title: string;
  model_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbChatMessageInsert {
  id: string;
  session_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  parts?: UIMessage["parts"] | null;
  attachments?: DbAttachmentMeta[] | null;
  model?: string | null;
  created_at?: string;
}

// =============================================================================
// Update Types
// =============================================================================

export interface DbChatSessionUpdate {
  title?: string;
  model_id?: string;
  updated_at?: string;
}

export interface DbChatMessageUpdate {
  content?: string;
  parts?: UIMessage["parts"] | null;
  model?: string | null;
}

// =============================================================================
// Arena Types
// =============================================================================

export type SessionStatus = "setup" | "running" | "paused" | "completed";

export interface DbTradingSession {
  id: string;
  name: string | null;
  status: SessionStatus;
  starting_capital: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface DbTradingSessionInsert {
  id?: string;
  name?: string | null;
  status?: SessionStatus;
  starting_capital: number;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
}

export interface DbPerformanceSnapshot {
  id: string;
  session_id: string;
  model_id: string;
  account_value: number;
  timestamp: string;
}

export interface DbPerformanceSnapshotInsert {
  id?: string;
  session_id: string;
  model_id: string;
  account_value: number;
  timestamp?: string;
}

export interface DbArenaChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  parts: UIMessage["parts"];
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbArenaChatMessageInsert {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  parts: UIMessage["parts"];
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

// =============================================================================
// Supabase Database Type Definition
// =============================================================================

type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      chat_sessions: {
        Row: DbChatSession;
        Insert: DbChatSessionInsert;
        Update: DbChatSessionUpdate;
        Relationships: GenericRelationship[];
      };
      chat_messages: {
        Row: DbChatMessage;
        Insert: DbChatMessageInsert;
        Update: DbChatMessageUpdate;
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "chat_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      library_files: {
        Row: DbLibraryFile;
        Insert: DbLibraryFileInsert;
        Update: Partial<DbLibraryFileInsert>;
        Relationships: GenericRelationship[];
      };
      trading_sessions: {
        Row: DbTradingSession;
        Insert: DbTradingSessionInsert;
        Update: Partial<DbTradingSessionInsert>;
        Relationships: GenericRelationship[];
      };
      performance_snapshots: {
        Row: DbPerformanceSnapshot;
        Insert: DbPerformanceSnapshotInsert;
        Update: Partial<DbPerformanceSnapshotInsert>;
        Relationships: GenericRelationship[];
      };
      arena_chat_messages: {
        Row: DbArenaChatMessage;
        Insert: DbArenaChatMessageInsert;
        Update: Partial<DbArenaChatMessageInsert>;
        Relationships: GenericRelationship[];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
