import { createIdGenerator, generateText, type UIMessage } from "ai";
import { requireServerClient } from "./server";
import { getModel } from "@/lib/ai/registry";
import type {
  DbChatSession,
  DbChatMessage,
  DbChatSessionInsert,
  DbChatMessageInsert,
} from "./types";
import type { ChatSession, PersistedMessage, AppUIMessage } from "@/types/chat";

// =============================================================================
// ID Generators
// =============================================================================

/**
 * Generate a unique session ID (UUID)
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Message ID generator with prefix for consistency
 */
export const generateMessageId = createIdGenerator({
  prefix: "msg",
  size: 16,
});

// =============================================================================
// Type Conversions
// =============================================================================

/**
 * Convert database session row to ChatSession
 */
function dbToSession(row: DbChatSession): ChatSession {
  return {
    id: row.id,
    title: row.title,
    modelId: row.model_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Convert database message row to PersistedMessage
 */
function dbToMessage(row: DbChatMessage): PersistedMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    parts: row.parts ?? undefined,
    model: row.model,
    createdAt: row.created_at,
  };
}

/**
 * Convert UIMessage to database insert format
 */
function messageToDbInsert(
  message: UIMessage,
  sessionId: string,
  model?: string,
): DbChatMessageInsert {
  // Extract text content from parts
  const content =
    message.parts
      ?.filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("") ?? "";

  return {
    id: message.id,
    session_id: sessionId,
    role: message.role as "user" | "assistant" | "system",
    content,
    parts: message.parts,
    model: model ?? null,
  };
}

// =============================================================================
// Session Operations
// =============================================================================

/**
 * Create a new chat session
 */
export async function createSession(data: {
  id?: string;
  title: string;
  modelId: string;
}): Promise<ChatSession> {
  const supabase = requireServerClient();
  const sessionId = data.id ?? generateSessionId();

  const insert: DbChatSessionInsert = {
    id: sessionId,
    title: data.title,
    model_id: data.modelId,
  };

  const { data: row, error } = await supabase
    .from("chat_sessions")
    .insert(insert as never)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return dbToSession(row as DbChatSession);
}

/**
 * Get a session by ID
 */
export async function getSession(
  sessionId: string,
): Promise<ChatSession | null> {
  const supabase = requireServerClient();

  const { data: row, error } = await supabase
    .from("chat_sessions")
    .select()
    .eq("id", sessionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned
      return null;
    }
    throw new Error(`Failed to get session: ${error.message}`);
  }

  return dbToSession(row);
}

/**
 * Get all sessions, ordered by updated_at desc
 */
export async function getSessions(): Promise<ChatSession[]> {
  const supabase = requireServerClient();

  const { data: rows, error } = await supabase
    .from("chat_sessions")
    .select()
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get sessions: ${error.message}`);
  }

  return rows.map(dbToSession);
}

/**
 * Update a session
 */
export async function updateSession(
  sessionId: string,
  data: { title?: string; modelId?: string },
): Promise<void> {
  const supabase = requireServerClient();

  const update: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (data.title !== undefined) {
    update.title = data.title;
  }
  if (data.modelId !== undefined) {
    update.model_id = data.modelId;
  }

  const { error } = await supabase
    .from("chat_sessions")
    .update(update as never)
    .eq("id", sessionId);

  if (error) {
    throw new Error(`Failed to update session: ${error.message}`);
  }
}

/**
 * Delete a session (messages will cascade delete)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = requireServerClient();

  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) {
    throw new Error(`Failed to delete session: ${error.message}`);
  }
}

// =============================================================================
// Message Operations
// =============================================================================

/**
 * Load all messages for a session
 */
export async function loadMessages(sessionId: string): Promise<UIMessage[]> {
  const supabase = requireServerClient();

  const { data: rows, error } = await supabase
    .from("chat_messages")
    .select()
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load messages: ${error.message}`);
  }

  return rows.map((row) => {
    const persisted = dbToMessage(row);
    return {
      id: persisted.id,
      role: persisted.role,
      parts: persisted.parts ?? [
        { type: "text" as const, text: persisted.content },
      ],
    };
  });
}

/**
 * Save a single message
 */
export async function saveMessage(
  sessionId: string,
  message: UIMessage,
  model?: string,
): Promise<void> {
  const supabase = requireServerClient();

  const insert = messageToDbInsert(message, sessionId, model);

  const { error } = await supabase
    .from("chat_messages")
    .insert(insert as never);

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`);
  }

  // Update session's updated_at
  await updateSession(sessionId, {});
}

/**
 * Save multiple messages (upsert to handle duplicates)
 */
export async function saveMessages(
  sessionId: string,
  messages: UIMessage[],
  model?: string,
): Promise<void> {
  const supabase = requireServerClient();

  const inserts = messages.map((msg) =>
    messageToDbInsert(msg, sessionId, model),
  );

  // Use upsert to handle cases where messages might already exist
  const { error } = await supabase
    .from("chat_messages")
    .upsert(inserts as never, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to save messages: ${error.message}`);
  }

  // Update session's updated_at
  await updateSession(sessionId, {});
}

/**
 * Save chat - creates session if needed, saves all messages
 * This is the main function called from onFinish in the chat API
 */
export async function saveChat(params: {
  sessionId: string;
  messages: UIMessage[];
  title?: string;
  modelId?: string;
}): Promise<void> {
  const { sessionId, messages, title, modelId } = params;

  console.log("[saveChat] sessionId:", sessionId);
  console.log("[saveChat] messages count:", messages.length);

  // Check if session exists
  const existingSession = await getSession(sessionId);
  console.log(
    "[saveChat] existingSession:",
    existingSession ? "found" : "not found",
  );

  if (!existingSession) {
    // Create session with AI-generated title from first message
    const firstUserMessage = messages.find((m) => m.role === "user");
    console.log(
      "[saveChat] firstUserMessage:",
      firstUserMessage ? JSON.stringify(firstUserMessage) : "not found",
    );
    console.log(
      "[saveChat] all messages roles:",
      messages.map((m) => m.role),
    );

    const sessionTitle =
      title ??
      (firstUserMessage ? await generateTitle(firstUserMessage) : "New Chat");
    console.log("[saveChat] sessionTitle:", sessionTitle);

    await createSession({
      id: sessionId,
      title: sessionTitle,
      modelId: modelId ?? "openai/gpt-4o",
    });
  }

  // Save all messages
  await saveMessages(sessionId, messages, modelId);
}

/**
 * Extract text content from a UIMessage
 */
function extractTextFromMessage(message: UIMessage): string {
  return (
    message.parts
      ?.filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("")
      .trim() ?? ""
  );
}

/**
 * Generate a title for a chat session using AI
 * Falls back to truncated first message if AI generation fails
 */
async function generateTitle(userMessage: UIMessage): Promise<string> {
  const text = extractTextFromMessage(userMessage);

  console.log("[generateTitle] User message:", JSON.stringify(userMessage));
  console.log("[generateTitle] Extracted text:", text);

  if (!text) return "New Chat";

  try {
    // Use a fast, cheap model for title generation
    const result = await generateText({
      model: getModel("openrouter/gpt-4o-mini"),
      system: `Generate a concise title (max 6 words) for a chat conversation based on the user's first message.
Rules:
- Be specific and descriptive
- No quotes or punctuation at the end
- Use the same language as the user's message
- Just output the title, nothing else`,
      prompt: text,
      maxOutputTokens: 30,
    });

    const title = result.text.trim();
    console.log("[generateTitle] AI generated title:", title);
    return title || text.slice(0, 50);
  } catch (error) {
    console.error("[generateTitle] Failed to generate title:", error);
    // Fallback to truncated message
    return text.length > 50 ? text.slice(0, 50) + "..." : text;
  }
}
