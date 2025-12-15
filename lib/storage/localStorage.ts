import type { StorageAdapter } from "@/types/storage";
import type {
  ChatSession,
  PersistedChatSession,
  PersistedMessage,
  AppUIMessage,
} from "@/types/chat";
import { toSession, toPersistedSession, toPersistedMessage } from "@/types/chat";
import { STORAGE_KEYS, MAX_LOCAL_SESSIONS } from "@/config/defaults";

/**
 * localStorage implementation of StorageAdapter.
 * Stores sessions and messages in browser localStorage.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly type = "local" as const;

  // ===========================================================================
  // Session Operations
  // ===========================================================================

  async getSessions(): Promise<ChatSession[]> {
    const data = this.getSessionsData();
    return Object.values(data)
      .map(toSession)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getSession(id: string): Promise<ChatSession | null> {
    const data = this.getSessionsData();
    const persisted = data[id];
    return persisted ? toSession(persisted) : null;
  }

  async createSession(
    session: Omit<ChatSession, "id" | "createdAt" | "updatedAt">
  ): Promise<ChatSession> {
    const now = new Date();
    const newSession: ChatSession = {
      ...session,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    const data = this.getSessionsData();
    data[newSession.id] = toPersistedSession(newSession);

    // Enforce max sessions limit
    this.enforceSessionLimit(data);

    this.setSessionsData(data);

    // Initialize empty messages array for the session
    this.setMessagesData(newSession.id, []);

    return newSession;
  }

  async updateSession(
    id: string,
    updates: Partial<Pick<ChatSession, "title" | "modelId">>
  ): Promise<void> {
    const data = this.getSessionsData();
    const existing = data[id];
    if (!existing) {
      throw new Error(`Session ${id} not found`);
    }

    data[id] = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.setSessionsData(data);
  }

  async deleteSession(id: string): Promise<void> {
    const data = this.getSessionsData();
    delete data[id];
    this.setSessionsData(data);

    // Also delete messages
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEYS.MESSAGES_PREFIX + id);
    }
  }

  // ===========================================================================
  // Message Operations
  // ===========================================================================

  async getMessages(sessionId: string): Promise<PersistedMessage[]> {
    return this.getMessagesData(sessionId);
  }

  async addMessage(sessionId: string, message: AppUIMessage, model?: string): Promise<void> {
    const messages = this.getMessagesData(sessionId);
    const persisted = toPersistedMessage(message, sessionId, model);
    messages.push(persisted);
    this.setMessagesData(sessionId, messages);

    // Update session's updatedAt
    await this.updateSession(sessionId, {});
  }

  async updateMessage(
    sessionId: string,
    messageId: string,
    data: Partial<Pick<PersistedMessage, "content" | "parts" | "model">>
  ): Promise<void> {
    const messages = this.getMessagesData(sessionId);
    const index = messages.findIndex((m) => m.id === messageId);

    if (index === -1) {
      throw new Error(`Message ${messageId} not found in session ${sessionId}`);
    }

    messages[index] = { ...messages[index], ...data };
    this.setMessagesData(sessionId, messages);
  }

  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    const messages = this.getMessagesData(sessionId);
    const filtered = messages.filter((m) => m.id !== messageId);
    this.setMessagesData(sessionId, filtered);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getSessionsData(): Record<string, PersistedChatSession> {
    if (typeof window === "undefined") return {};

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private setSessionsData(data: Record<string, PersistedChatSession>): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(data));
  }

  private getMessagesData(sessionId: string): PersistedMessage[] {
    if (typeof window === "undefined") return [];

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MESSAGES_PREFIX + sessionId);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private setMessagesData(sessionId: string, messages: PersistedMessage[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.MESSAGES_PREFIX + sessionId, JSON.stringify(messages));
  }

  private enforceSessionLimit(data: Record<string, PersistedChatSession>): void {
    const sessions = Object.values(data);
    if (sessions.length <= MAX_LOCAL_SESSIONS) return;

    // Sort by updatedAt ascending (oldest first)
    sessions.sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );

    // Remove oldest sessions
    const toRemove = sessions.slice(0, sessions.length - MAX_LOCAL_SESSIONS);
    for (const session of toRemove) {
      delete data[session.id];
      // Also delete messages
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEYS.MESSAGES_PREFIX + session.id);
      }
    }
  }
}
