// ============================================================================
// Parallel AI Task Webhook Handler
// Receives Task API completion webhooks and triggers agent workflows
// Follows Standard Webhooks spec: https://github.com/standard-webhooks/standard-webhooks
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { storeResearchResult } from "@/lib/supabase/research";
import { PARALLEL_WEBHOOK_SECRET } from "@/lib/config";
import type { WebhookPayload } from "@/lib/parallel/types";

// ============================================================================
// Standard Webhooks Signature Verification
// ============================================================================

/**
 * Compute HMAC-SHA256 signature per Standard Webhooks spec
 * Payload format: "{webhook-id}.{webhook-timestamp}.{body}"
 */
function computeSignature(
  secret: string,
  webhookId: string,
  webhookTimestamp: string,
  body: string,
): string {
  const payload = `${webhookId}.${webhookTimestamp}.${body}`;
  const digest = createHmac("sha256", secret).update(payload).digest();
  return digest.toString("base64");
}

/**
 * Verify webhook signature against header
 * Header format: "v1,<base64 signature>" (space-delimited if multiple)
 */
function isValidSignature(
  webhookSignatureHeader: string,
  expectedSignature: string,
): boolean {
  const signatures = webhookSignatureHeader.split(" ");

  for (const part of signatures) {
    const [version, sig] = part.split(",", 2);
    if (version === "v1" && sig) {
      try {
        if (timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))) {
          return true;
        }
      } catch {
        continue;
      }
    }
  }

  return false;
}

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * POST /api/parallel/task/webhook
 *
 * Receives webhook callbacks from Parallel Task API when research completes.
 * Uses Standard Webhooks signature verification.
 *
 * Headers:
 * - webhook-id: Unique identifier for the webhook event
 * - webhook-timestamp: Unix timestamp in seconds
 * - webhook-signature: "v1,<base64 signature>"
 */
export async function POST(req: NextRequest) {
  // 1. Extract Standard Webhooks headers
  const webhookId = req.headers.get("webhook-id");
  const webhookTimestamp = req.headers.get("webhook-timestamp");
  const webhookSignature = req.headers.get("webhook-signature");
  const body = await req.text();

  if (!PARALLEL_WEBHOOK_SECRET) {
    console.error(
      "[parallel/task/webhook] PARALLEL_WEBHOOK_SECRET not configured",
    );
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  // 2. Verify all required headers are present
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    console.error("[parallel/task/webhook] Missing required webhook headers");
    return NextResponse.json(
      { error: "Missing webhook headers" },
      { status: 400 },
    );
  }

  // 3. Verify signature
  const expectedSignature = computeSignature(
    PARALLEL_WEBHOOK_SECRET,
    webhookId,
    webhookTimestamp,
    body,
  );

  if (!isValidSignature(webhookSignature, expectedSignature)) {
    console.error("[parallel/task/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    console.error("[parallel/task/webhook] Invalid JSON payload");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(
    `[parallel/task/webhook] Received: run_id=${payload.run_id}, status=${payload.status}`,
  );

  // 3. Store result in Supabase (for audit/retrieval)
  try {
    await storeResearchResult(payload);
  } catch (error) {
    console.error("[parallel/task/webhook] Failed to store result:", error);
    // Continue - don't fail the webhook if storage fails
  }

  // 4. Trigger agent with research payload
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const vercelUrl = process.env.VERCEL_URL;

  if (!webhookSecret || !vercelUrl) {
    console.error(
      "[parallel/task/webhook] Missing WEBHOOK_SECRET or VERCEL_URL for agent trigger",
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
        `[parallel/task/webhook] Failed to trigger agent: ${triggerResponse.status}`,
      );
    } else {
      console.log("[parallel/task/webhook] Agent triggered successfully");
    }
  } catch (error) {
    console.error("[parallel/task/webhook] Failed to trigger agent:", error);
  }

  return NextResponse.json({ received: true });
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /api/parallel/task/webhook
 *
 * Health check endpoint for webhook configuration
 */
export async function GET() {
  return NextResponse.json({
    status: "ready",
    message: "Parallel AI Task webhook endpoint",
    configured: Boolean(PARALLEL_WEBHOOK_SECRET),
  });
}
