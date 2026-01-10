// ============================================================================
// Research Results Storage
// Stores async research results from Parallel Task API
// ============================================================================

import { createServerClient } from "./server";
import type {
  WebhookPayload,
  ResearchResult,
  FieldBasis,
} from "@/lib/parallel/types";

// ============================================================================
// Store Research Result (from webhook)
// ============================================================================

/**
 * Store result from Parallel webhook
 * Uses upsert to handle both insert and update cases
 */
export async function storeResearchResult(
  payload: WebhookPayload
): Promise<void> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client.from("research_results").upsert(
    {
      run_id: payload.run_id,
      status: payload.status,
      content: payload.content ?? null,
      basis: payload.basis ?? null,
      error: payload.error ?? null,
      completed_at: new Date().toISOString(),
    } as never,
    {
      onConflict: "run_id",
    }
  );

  if (error) {
    console.error("[supabase/research] Failed to store result:", error);
    throw error;
  }

  console.log(
    `[supabase/research] Stored result: run_id=${payload.run_id}, status=${payload.status}`
  );
}

// ============================================================================
// Create Pending Research
// ============================================================================

/**
 * Create pending record when task is initiated
 * Allows tracking tasks before webhook completes
 */
export async function createPendingResearch(runId: string): Promise<void> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client.from("research_results").insert({
    run_id: runId,
    status: "pending",
  } as never);

  if (error) {
    console.error("[supabase/research] Failed to create pending:", error);
    throw error;
  }

  console.log(`[supabase/research] Created pending: run_id=${runId}`);
}

// ============================================================================
// Get Research Result
// ============================================================================

/**
 * Retrieve result by run_id
 * Used for polling fallback or audit
 */
export async function getResearchResult(
  runId: string
): Promise<ResearchResult | null> {
  const client = createServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from("research_results")
    .select("*")
    .eq("run_id", runId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    console.error("[supabase/research] Failed to get result:", error);
    throw error;
  }

  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    run_id: row.run_id as string,
    status: row.status as "pending" | "completed" | "failed",
    content: (row.content as string) ?? undefined,
    basis: (row.basis as FieldBasis[]) ?? undefined,
    error: (row.error as string) ?? undefined,
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string) ?? undefined,
  };
}

// ============================================================================
// Get Recent Research Results
// ============================================================================

/**
 * Get recent research results for audit/display
 */
export async function getRecentResearchResults(
  limit = 20
): Promise<ResearchResult[]> {
  const client = createServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("research_results")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[supabase/research] Failed to get recent results:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    run_id: row.run_id as string,
    status: row.status as "pending" | "completed" | "failed",
    content: (row.content as string) ?? undefined,
    basis: (row.basis as FieldBasis[]) ?? undefined,
    error: (row.error as string) ?? undefined,
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string) ?? undefined,
  }));
}
