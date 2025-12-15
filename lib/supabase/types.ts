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
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
