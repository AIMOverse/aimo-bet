import type { StorageAdapter } from "@/types/storage";
import { getStorageMode } from "@/types/storage";
import { LocalStorageAdapter } from "./localStorage";
import { SupabaseStorageAdapter } from "./supabase";
import { isSupabaseConfigured } from "@/lib/supabase/client";

let storageInstance: StorageAdapter | null = null;

/**
 * Get the appropriate storage adapter based on configuration.
 * - If NEXT_PUBLIC_STORAGE_MODE=supabase and Supabase is configured, use Supabase
 * - Otherwise, fall back to localStorage
 */
export function getStorageAdapter(): StorageAdapter {
  if (storageInstance) {
    return storageInstance;
  }

  const mode = getStorageMode();

  if (mode === "supabase" && isSupabaseConfigured()) {
    storageInstance = new SupabaseStorageAdapter();
  } else {
    storageInstance = new LocalStorageAdapter();
  }

  return storageInstance;
}

/**
 * Reset storage instance (useful for testing)
 */
export function resetStorageAdapter(): void {
  storageInstance = null;
}

export { LocalStorageAdapter } from "./localStorage";
export { SupabaseStorageAdapter } from "./supabase";
