import { getSupabaseClient } from "./client";
import type { UIMessage } from "ai";
import type {
  TradingSession,
  PerformanceSnapshot,
  SessionStatus,
  ChatMetadata,
  ChatMessage,
} from "./types";
import { DEFAULT_STARTING_CAPITAL } from "@/lib/config";
import type {
  DbTradingSessionInsert,
  DbPerformanceSnapshotInsert,
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
// ARENA CHAT MESSAGES
// ============================================================================

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
    throw error;
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

export async function saveChatMessages(messages: ChatMessage[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const inserts: DbArenaChatMessageInsert[] = messages.map((msg) => ({
    id: msg.id,
    session_id: msg.metadata?.sessionId ?? "",
    role: msg.role,
    parts: msg.parts,
    metadata: msg.metadata as unknown as Record<string, unknown>,
  }));

  const { error } = await client
    .from("arena_chat_messages")
    .upsert(inserts as never[], { onConflict: "id" });

  if (error) {
    console.error("Failed to save arena chat messages:", error);
    throw error;
  }
}

// ============================================================================
// PERFORMANCE SNAPSHOTS
// ============================================================================

export async function getPerformanceSnapshots(
  sessionId: string,
  hoursBack = 24,
): Promise<PerformanceSnapshot[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("performance_snapshots")
    .select("*")
    .eq("session_id", sessionId)
    .gte("timestamp", since)
    .order("timestamp", { ascending: true });

  if (error) {
    console.error("Failed to fetch performance snapshots:", error);
    throw error;
  }

  return (data || []).map(mapPerformanceSnapshot);
}

export async function createPerformanceSnapshot(
  sessionId: string,
  modelId: string,
  accountValue: number,
): Promise<PerformanceSnapshot> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const insertData: DbPerformanceSnapshotInsert = {
    session_id: sessionId,
    model_id: modelId,
    account_value: accountValue,
  };

  const { data, error } = await client
    .from("performance_snapshots")
    .insert(insertData as never)
    .select()
    .single();

  if (error) {
    console.error("Failed to create performance snapshot:", error);
    throw error;
  }

  return mapPerformanceSnapshot(data);
}

export async function createBulkSnapshots(
  snapshots: Array<{
    sessionId: string;
    modelId: string;
    accountValue: number;
  }>,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const inserts: DbPerformanceSnapshotInsert[] = snapshots.map((s) => ({
    session_id: s.sessionId,
    model_id: s.modelId,
    account_value: s.accountValue,
  }));

  const { error } = await client
    .from("performance_snapshots")
    .insert(inserts as never[]);

  if (error) {
    console.error("Failed to create bulk snapshots:", error);
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

function mapPerformanceSnapshot(
  row: Record<string, unknown>,
): PerformanceSnapshot {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    modelId: row.model_id as string,
    accountValue: Number(row.account_value),
    timestamp: new Date(row.timestamp as string),
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
