import type { UIMessage } from "ai";

// =============================================================================
// Cache Configuration
// =============================================================================

const USER_CHAT_PREFIX = "aimo-chat-messages-";
const ARENA_CHAT_PREFIX = "aimo-arena-chat-";
const CACHE_VERSION = "v1";

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

// =============================================================================
// User Chat Cache Functions
// =============================================================================

/**
 * Get the cache key for a user chat session's messages
 */
function getUserChatCacheKey(sessionId: string): string {
  return `${USER_CHAT_PREFIX}${CACHE_VERSION}-${sessionId}`;
}

/**
 * Get cached messages for a user chat session
 * Returns empty array if not found or on error
 */
export function getCachedMessages(sessionId: string): UIMessage[] {
  if (!isBrowser()) return [];

  try {
    const key = getUserChatCacheKey(sessionId);
    const cached = localStorage.getItem(key);
    if (!cached) return [];

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch (error) {
    console.error("Failed to read message cache:", error);
    return [];
  }
}

/**
 * Cache messages for a user chat session
 */
export function setCachedMessages(
  sessionId: string,
  messages: UIMessage[]
): void {
  if (!isBrowser()) return;

  try {
    const key = getUserChatCacheKey(sessionId);
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    // Handle quota exceeded or other errors
    console.error("Failed to cache messages:", error);
    // Try to clear old caches if storage is full
    clearOldCaches();
  }
}

/**
 * Clear cached messages for a user chat session
 */
export function clearCachedMessages(sessionId: string): void {
  if (!isBrowser()) return;

  try {
    const key = getUserChatCacheKey(sessionId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Failed to clear message cache:", error);
  }
}

/**
 * Clear all user chat message caches
 */
export function clearAllCachedMessages(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(USER_CHAT_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error("Failed to clear all message caches:", error);
  }
}

// =============================================================================
// Arena Chat Cache Functions
// =============================================================================

/**
 * Get the cache key for an arena trading session's messages
 */
function getArenaCacheKey(tradingSessionId: string): string {
  return `${ARENA_CHAT_PREFIX}${CACHE_VERSION}-${tradingSessionId}`;
}

/**
 * Get cached messages for an arena trading session
 * Returns empty array if not found or on error
 */
export function getArenaCachedMessages(tradingSessionId: string): UIMessage[] {
  if (!isBrowser()) return [];

  try {
    const key = getArenaCacheKey(tradingSessionId);
    const cached = localStorage.getItem(key);
    if (!cached) return [];

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch (error) {
    console.error("Failed to read arena message cache:", error);
    return [];
  }
}

/**
 * Cache messages for an arena trading session
 */
export function setArenaCachedMessages(
  tradingSessionId: string,
  messages: UIMessage[]
): void {
  if (!isBrowser()) return;

  try {
    const key = getArenaCacheKey(tradingSessionId);
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error("Failed to cache arena messages:", error);
    clearOldCaches();
  }
}

/**
 * Clear cached messages for an arena trading session
 */
export function clearArenaCachedMessages(tradingSessionId: string): void {
  if (!isBrowser()) return;

  try {
    const key = getArenaCacheKey(tradingSessionId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Failed to clear arena message cache:", error);
  }
}

/**
 * Clear all arena chat message caches
 */
export function clearAllArenaCachedMessages(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(ARENA_CHAT_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error("Failed to clear all arena message caches:", error);
  }
}

// =============================================================================
// Cache Maintenance
// =============================================================================

/**
 * Clear old version caches and oldest caches if storage is running low
 */
function clearOldCaches(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(localStorage);
    const chatCaches: { key: string; time: number }[] = [];

    for (const key of keys) {
      const isUserChat = key.startsWith(USER_CHAT_PREFIX);
      const isArenaChat = key.startsWith(ARENA_CHAT_PREFIX);

      if (isUserChat || isArenaChat) {
        // Remove old version caches
        if (!key.includes(CACHE_VERSION)) {
          localStorage.removeItem(key);
          continue;
        }
        // Track current version caches
        chatCaches.push({ key, time: Date.now() });
      }
    }

    // If too many caches, remove oldest ones
    if (chatCaches.length > 50) {
      const toRemove = chatCaches.slice(0, chatCaches.length - 50);
      for (const { key } of toRemove) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error("Failed to clear old caches:", error);
  }
}
