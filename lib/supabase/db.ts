import { createServerClient } from "./server";
import type { UIMessage } from "ai";
import type {
  TradingSession,
  SessionStatus,
  ChatMetadata,
  ChatMessage,
} from "./types";
import { DEFAULT_STARTING_CAPITAL, GLOBAL_SESSION_ID } from "@/lib/config";
import type { DbTradingSessionInsert, DbArenaChatMessageInsert } from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

const GLOBAL_SESSION_NAME = "Global Arena";

// ============================================================================
// GLOBAL SESSION
// ============================================================================

/**
 * Get the global "Global Arena" session.
 * Uses a fixed UUID that is created by migration 007.
 * This session always exists - if it doesn't, something is wrong with the DB setup.
 */
export async function getGlobalSession(): Promise<TradingSession> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const { data, error } = await client
    .from("trading_sessions")
    .select("*")
    .eq("id", GLOBAL_SESSION_ID)
    .single();

  if (error || !data) {
    console.error("Global session not found:", error);
    throw new Error(
      `Global Arena session (${GLOBAL_SESSION_ID}) not found. Run migrations.`
    );
  }

  return mapTradingSession(data);
}

// ============================================================================
// TRADING SESSIONS
// ============================================================================

export async function getTradingSessions(): Promise<TradingSession[]> {
  const client = createServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("trading_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch trading sessions:", error);
    throw error;
  }

  return (data || []).map(mapTradingSession);
}

export async function getTradingSession(
  id: string
): Promise<TradingSession | null> {
  const client = createServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from("trading_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("Failed to fetch trading session:", error);
    throw error;
  }

  return data ? mapTradingSession(data) : null;
}

export async function getActiveSession(): Promise<TradingSession | null> {
  const client = createServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from("trading_sessions")
    .select("*")
    .in("status", ["setup", "running", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("Failed to fetch active session:", error);
    throw error;
  }

  return data ? mapTradingSession(data) : null;
}

export async function createTradingSession(
  name?: string,
  startingCapital = DEFAULT_STARTING_CAPITAL
): Promise<TradingSession> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const insertData: DbTradingSessionInsert = {
    name: name ?? null,
    starting_capital: startingCapital,
    status: "setup",
  };

  const { data, error } = await client
    .from("trading_sessions")
    .insert(insertData as never)
    .select()
    .single();

  if (error) {
    console.error("Failed to create trading session:", error);
    throw error;
  }

  return mapTradingSession(data);
}

export async function updateSessionStatus(
  id: string,
  status: SessionStatus
): Promise<void> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const updates: Record<string, unknown> = { status };
  if (status === "running") {
    updates.started_at = new Date().toISOString();
  } else if (status === "completed") {
    updates.ended_at = new Date().toISOString();
  }

  const { error } = await client
    .from("trading_sessions")
    .update(updates as never)
    .eq("id", id);

  if (error) {
    console.error("Failed to update session status:", error);
    throw error;
  }
}

// ============================================================================
// ARENA CHAT MESSAGES (For user chat - agent messages use agent_decisions)
// ============================================================================

// NOTE: Agent messages are now stored as agent_decisions.
// Use recordAgentDecision() from lib/supabase/agents.ts for agent messages.
// These functions are kept for user chat functionality.

export async function getChatMessages(
  sessionId: string,
  limit = 100
): Promise<ChatMessage[]> {
  const client = createServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("arena_chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch arena chat messages:", error);
    return [];
  }

  return (data || []).map(mapChatMessage);
}

export async function saveChatMessage(message: ChatMessage): Promise<void> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const insertData: DbArenaChatMessageInsert = {
    id: message.id,
    session_id: message.metadata?.sessionId ?? "",
    role: message.role,
    parts: message.parts,
    metadata: message.metadata as unknown as Record<string, unknown>,
  };

  const { error } = await client
    .from("arena_chat_messages")
    .upsert(insertData as never, { onConflict: "id" });

  if (error) {
    console.error("Failed to save arena chat message:", error);
    throw error;
  }
}

// ============================================================================
// MAPPERS
// ============================================================================

function mapTradingSession(row: Record<string, unknown>): TradingSession {
  return {
    id: row.id as string,
    name: row.name as string | undefined,
    status: row.status as SessionStatus,
    startingCapital: Number(row.starting_capital),
    startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
    endedAt: row.ended_at ? new Date(row.ended_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function mapChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    role: row.role as "user" | "assistant",
    parts: row.parts as UIMessage["parts"],
    metadata: row.metadata as ChatMetadata,
  };
}
