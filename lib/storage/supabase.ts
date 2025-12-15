import type { StorageAdapter } from "@/types/storage";
import type { ChatSession, PersistedMessage, AppUIMessage } from "@/types/chat";
import { toPersistedMessage } from "@/types/chat";
import { requireSupabaseClient } from "@/lib/supabase/client";
import type { DbChatSession, DbChatMessage } from "@/lib/supabase/types";

/**
 * Supabase implementation of StorageAdapter.
 * Stores sessions and messages in Supabase PostgreSQL.
 *
 * Note: Uses `any` type for Supabase client to work around complex
 * generic type inference issues in @supabase/supabase-js v2.87+.
 * The queries are type-safe at runtime through our conversion helpers.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  readonly type = "supabase" as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get client(): any {
    return requireSupabaseClient();
  }

  // ===========================================================================
  // Session Operations
  // ===========================================================================

  async getSessions(): Promise<ChatSession[]> {
    const { data, error } = await this.client
      .from("chat_sessions")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((row: DbChatSession) => this.dbSessionToSession(row));
  }

  async getSession(id: string): Promise<ChatSession | null> {
    const { data, error } = await this.client
      .from("chat_sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw error;
    }

    return data ? this.dbSessionToSession(data as DbChatSession) : null;
  }

  async createSession(
    session: Omit<ChatSession, "id" | "createdAt" | "updatedAt">
  ): Promise<ChatSession> {
    const { data, error } = await this.client
      .from("chat_sessions")
      .insert({
        title: session.title,
        model_id: session.modelId,
      })
      .select()
      .single();

    if (error) throw error;
    return this.dbSessionToSession(data as DbChatSession);
  }

  async updateSession(
    id: string,
    updates: Partial<Pick<ChatSession, "title" | "modelId">>
  ): Promise<void> {
    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.modelId !== undefined) dbUpdates.model_id = updates.modelId;

    const { error } = await this.client
      .from("chat_sessions")
      .update(dbUpdates)
      .eq("id", id);

    if (error) throw error;
  }

  async deleteSession(id: string): Promise<void> {
    // Messages are deleted via ON DELETE CASCADE
    const { error } = await this.client.from("chat_sessions").delete().eq("id", id);

    if (error) throw error;
  }

  // ===========================================================================
  // Message Operations
  // ===========================================================================

  async getMessages(sessionId: string): Promise<PersistedMessage[]> {
    const { data, error } = await this.client
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row: DbChatMessage) => this.dbMessageToPersistedMessage(row));
  }

  async addMessage(sessionId: string, message: AppUIMessage, model?: string): Promise<void> {
    const persisted = toPersistedMessage(message, sessionId, model);

    const { error } = await this.client.from("chat_messages").insert({
      id: persisted.id,
      session_id: sessionId,
      role: persisted.role,
      content: persisted.content,
      parts: persisted.parts ?? null,
      attachments: persisted.attachments ?? null,
      model: persisted.model ?? null,
      created_at: persisted.createdAt,
    });

    if (error) throw error;

    // Update session's updated_at
    await this.updateSession(sessionId, {});
  }

  async updateMessage(
    sessionId: string,
    messageId: string,
    data: Partial<Pick<PersistedMessage, "content" | "parts" | "model">>
  ): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};

    if (data.content !== undefined) dbUpdates.content = data.content;
    if (data.parts !== undefined) dbUpdates.parts = data.parts;
    if (data.model !== undefined) dbUpdates.model = data.model;

    const { error } = await this.client
      .from("chat_messages")
      .update(dbUpdates)
      .eq("id", messageId)
      .eq("session_id", sessionId);

    if (error) throw error;
  }

  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    const { error } = await this.client
      .from("chat_messages")
      .delete()
      .eq("id", messageId)
      .eq("session_id", sessionId);

    if (error) throw error;
  }

  // ===========================================================================
  // Conversion Helpers
  // ===========================================================================

  private dbSessionToSession(db: DbChatSession): ChatSession {
    return {
      id: db.id,
      title: db.title,
      modelId: db.model_id,
      createdAt: new Date(db.created_at),
      updatedAt: new Date(db.updated_at),
    };
  }

  private dbMessageToPersistedMessage(db: DbChatMessage): PersistedMessage {
    return {
      id: db.id,
      sessionId: db.session_id,
      role: db.role,
      content: db.content,
      parts: db.parts ?? undefined,
      attachments: db.attachments ?? undefined,
      model: db.model,
      createdAt: db.created_at,
    };
  }
}
