import type { UIMessage } from "ai";

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
