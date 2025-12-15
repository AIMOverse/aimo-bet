import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Check if Supabase server client can be created
 */
export function isSupabaseServerConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseServiceKey);
}

/**
 * Create a server-side Supabase client with service role key.
 * Bypasses RLS - use only in API routes.
 *
 * IMPORTANT: Never expose this client to the browser.
 */
export function createServerClient(): SupabaseClient<Database> | null {
  if (!isSupabaseServerConfigured()) {
    return null;
  }

  return createClient<Database>(supabaseUrl!, supabaseServiceKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Get a server client instance or throw if not configured.
 * Creates a new client for each request to ensure isolation.
 */
export function requireServerClient(): SupabaseClient<Database> {
  const client = createServerClient();
  if (!client) {
    throw new Error(
      "Supabase server is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }
  return client;
}
