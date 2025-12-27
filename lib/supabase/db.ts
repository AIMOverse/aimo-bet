import { getSupabaseClient } from "./client";
import type { UIMessage } from "ai";
import type {
  TradingSession,
  SessionStatus,
  ChatMetadata,
  ChatMessage,
} from "./types";
import { DEFAULT_STARTING_CAPITAL } from "@/lib/config";
import type {
  DbTradingSessionInsert,
  DbArenaChatMessageInsert,
} from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

const GLOBAL_SESSION_NAME = "Global Arena";

// ============================================================================
// GLOBAL SESSION
// ============================================================================

/**
 * Get or create the global "Global Arena" session.
 * This session always exists and is used when no specific sessionId is provided.
 */
export async function getGlobalSession(): Promise<TradingSession> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  // Try to find existing running global session
  const { data: existing, error: findError } = await client
    .from("trading_sessions")
    .select("*")
    .eq("name", GLOBAL_SESSION_NAME)
    .eq("status", "running")
    .single();

  if (existing && !findError) {
    return mapTradingSession(existing);
  }

  // If no running session found (or error finding), create a new one
  if (findError && findError.code !== "PGRST116") {
    console.error("Error finding global session:", findError);
  }

  const insertData: DbTradingSessionInsert = {
    name: GLOBAL_SESSION_NAME,
    starting_capital: DEFAULT_STARTING_CAPITAL,
    status: "running",
    started_at: new Date().toISOString(),
  };

  const { data: newSession, error: createError } = await client
    .from("trading_sessions")
    .insert(insertData as never)
    .select()
    .single();

  if (createError || !newSession) {
    console.error("Failed to create global session:", createError);
    throw createError ?? new Error("Failed to create global session");
  }

  const session = newSession as Record<string, unknown>;
  console.log("[arena] Created new Global Arena session:", session.id);
  return mapTradingSession(session);
}

// ============================================================================
// TRADING SESSIONS
// ============================================================================

export async function getTradingSessions(): Promise<TradingSession[]> {
  const client = getSupabaseClient();
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
  id: string,
): Promise<TradingSession | null> {
  const client = getSupabaseClient();
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
  const client = getSupabaseClient();
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
  startingCapital = DEFAULT_STARTING_CAPITAL,
): Promise<TradingSession> {
  const client = getSupabaseClient();
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
  status: SessionStatus,
): Promise<void> {
  const client = getSupabaseClient();
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
  limit = 100,
): Promise<ChatMessage[]> {
  const client = getSupabaseClient();
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
  const client = getSupabaseClient();
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
// PERFORMANCE SNAPSHOTS (DEPRECATED - Use agent_decisions via lib/supabase/agents.ts)
// ============================================================================

// NOTE: Performance snapshots are now derived from agent_decisions.portfolio_value_after.
// Use getChartData() from lib/supabase/agents.ts or the usePerformanceChart hook instead.
// The performance_snapshots table is deprecated.

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
