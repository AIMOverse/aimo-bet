/**
 * Default configuration values
 */

/** Default model to use when none is selected */
export const DEFAULT_MODEL_ID = process.env.DEFAULT_MODEL ?? "gpt-4o";

/** Default provider */
export const DEFAULT_PROVIDER_ID = "aimo-network";

/** Default title for new chat sessions */
export const DEFAULT_SESSION_TITLE = "New Chat";

/** Maximum number of sessions to keep in localStorage */
export const MAX_LOCAL_SESSIONS = 100;

/** LocalStorage keys */
export const STORAGE_KEYS = {
  SESSIONS: "aimo-chat-sessions",
  MESSAGES_PREFIX: "aimo-chat-messages-",
  SETTINGS: "aimo-chat-settings",
} as const;

/** System prompt (can be customized) */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. Be concise and clear in your responses.`;
