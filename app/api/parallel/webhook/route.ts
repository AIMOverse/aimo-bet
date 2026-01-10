// ============================================================================
// Parallel AI Webhook Handler
// Receives Task API completion webhooks and triggers agent workflows
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { storeResearchResult } from "@/lib/supabase/research";
import { PARALLEL_WEBHOOK_SECRET } from "@/lib/config";
import type { WebhookPayload } from "@/lib/parallel/types";

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * POST /api/parallel/webhook
 *
 * Receives webhook callbacks from Parallel Task API when research completes.
 * 1. Verifies HMAC signature
 * 2. Stores result in Supabase
 * 3. Triggers agent workflow with research payload
 */
export async function POST(req: NextRequest) {
  // 1. Verify signature
  const signature = req.headers.get("x-parallel-signature");
  const body = await req.text();

  if (!PARALLEL_WEBHOOK_SECRET) {
    console.error("[parallel/webhook] PARALLEL_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const expectedSignature = createHmac("sha256", PARALLEL_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error("[parallel/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    console.error("[parallel/webhook] Invalid JSON payload");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(
    `[parallel/webhook] Received: run_id=${payload.run_id}, status=${payload.status}`
  );

  // 3. Store result in Supabase (for audit/retrieval)
  try {
    await storeResearchResult(payload);
  } catch (error) {
    console.error("[parallel/webhook] Failed to store result:", error);
    // Continue - don't fail the webhook if storage fails
  }

  // 4. Trigger agent with research payload
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const vercelUrl = process.env.VERCEL_URL;

  if (!webhookSecret || !vercelUrl) {
    console.error(
      "[parallel/webhook] Missing WEBHOOK_SECRET or VERCEL_URL for agent trigger"
    );
    return NextResponse.json({ received: true, triggered: false });
  }

  try {
    const triggerUrl = vercelUrl.startsWith("http")
      ? `${vercelUrl}/api/agents/trigger`
      : `https://${vercelUrl}/api/agents/trigger`;

    const triggerResponse = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify({
        triggerType: "research_complete",
        research: payload,
      }),
    });

    if (!triggerResponse.ok) {
      console.error(
        `[parallel/webhook] Failed to trigger agent: ${triggerResponse.status}`
      );
    } else {
      console.log("[parallel/webhook] Agent triggered successfully");
    }
  } catch (error) {
    console.error("[parallel/webhook] Failed to trigger agent:", error);
  }

  return NextResponse.json({ received: true });
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /api/parallel/webhook
 *
 * Health check endpoint for webhook configuration
 */
export async function GET() {
  return NextResponse.json({
    status: "ready",
    message: "Parallel AI webhook endpoint",
    configured: Boolean(PARALLEL_WEBHOOK_SECRET),
  });
}
