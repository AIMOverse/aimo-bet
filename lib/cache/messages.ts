import type { UIMessage } from "ai";

const CACHE_PREFIX = "aimo-chat-messages-";
const CACHE_VERSION = "v1";

/**
 * Get the cache key for a session's messages
 */
function getCacheKey(sessionId: string): string {
  return `${CACHE_PREFIX}${CACHE_VERSION}-${sessionId}`;
}

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * Get cached messages for a session
 * Returns empty array if not found or on error
 */
export function getCachedMessages(sessionId: string): UIMessage[] {
  if (!isBrowser()) return [];

  try {
    const key = getCacheKey(sessionId);
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
 * Cache messages for a session
 */
export function setCachedMessages(
  sessionId: string,
  messages: UIMessage[]
): void {
  if (!isBrowser()) return;

  try {
    const key = getCacheKey(sessionId);
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    // Handle quota exceeded or other errors
    console.error("Failed to cache messages:", error);
    // Try to clear old caches if storage is full
    clearOldCaches();
  }
}

/**
 * Clear cached messages for a session
 */
export function clearCachedMessages(sessionId: string): void {
  if (!isBrowser()) return;

  try {
    const key = getCacheKey(sessionId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Failed to clear message cache:", error);
  }
}

/**
 * Clear all message caches
 */
export function clearAllCachedMessages(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error("Failed to clear all message caches:", error);
  }
}

/**
 * Clear old version caches and oldest caches if storage is running low
 */
function clearOldCaches(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(localStorage);
    const messageCaches: { key: string; time: number }[] = [];

    for (const key of keys) {
      if (key.startsWith(CACHE_PREFIX)) {
        // Remove old version caches
        if (!key.includes(CACHE_VERSION)) {
          localStorage.removeItem(key);
          continue;
        }
        // Track current version caches
        messageCaches.push({ key, time: Date.now() });
      }
    }

    // If too many caches, remove oldest ones
    if (messageCaches.length > 50) {
      const toRemove = messageCaches.slice(0, messageCaches.length - 50);
      for (const { key } of toRemove) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error("Failed to clear old caches:", error);
  }
}
