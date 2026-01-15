// ============================================================================
// Parallel AI Monitor Webhook Handler
// Receives Monitor API event webhooks and triggers agent workflows
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { PARALLEL_WEBHOOK_SECRET } from "@/lib/config";
import { getMonitorEventGroup } from "@/lib/parallel/client";
import type {
  MonitorWebhookPayload,
  MonitorEventGroup,
  NewsEventStructuredOutput,
} from "@/lib/parallel/types";

// ============================================================================
// Types
// ============================================================================

/** News event payload sent to agent trigger */
export interface NewsEventPayload {
  monitor_id: string;
  event_group_id: string;
  metadata?: Record<string, string>;
  events: Array<{
    output: string;
    event_date: string;
    source_urls: string[];
    result?: {
      type: string;
      content: NewsEventStructuredOutput;
    };
  }>;
  /** Enriched context extracted from metadata and structured output */
  context?: {
    category?: string;
    type?: string;
    urgency?: string;
    sentiment?: string;
    tradeable?: boolean;
  };
}

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * POST /api/parallel/monitor/webhook
 *
 * Receives webhook callbacks from Parallel Monitor API when events are detected.
 * 1. Verifies HMAC signature
 * 2. Fetches full event details from Parallel API
 * 3. Triggers agent workflow with news event payload
 *
 * Event types:
 * - monitor.event.detected: New material changes detected (triggers agent)
 * - monitor.execution.completed: Run finished with no events (logged only)
 * - monitor.execution.failed: Run failed (logged only)
 */
export async function POST(req: NextRequest) {
  // 1. Verify signature
  const signature = req.headers.get("x-parallel-signature");
  const body = await req.text();

  if (!PARALLEL_WEBHOOK_SECRET) {
    console.error("[parallel/monitor/webhook] PARALLEL_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const expectedSignature = createHmac("sha256", PARALLEL_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error("[parallel/monitor/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload
  let payload: MonitorWebhookPayload;
  try {
    payload = JSON.parse(body) as MonitorWebhookPayload;
  } catch {
    console.error("[parallel/monitor/webhook] Invalid JSON payload");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(
    `[parallel/monitor/webhook] Received: type=${payload.type}, monitor_id=${payload.data.monitor_id}`
  );

  // 3. Handle based on event type
  switch (payload.type) {
    case "monitor.event.detected":
      return handleEventDetected(payload);

    case "monitor.execution.completed":
      console.log(
        `[parallel/monitor/webhook] Monitor ${payload.data.monitor_id} completed with no events`
      );
      return NextResponse.json({ received: true, action: "none" });

    case "monitor.execution.failed":
      console.error(
        `[parallel/monitor/webhook] Monitor ${payload.data.monitor_id} failed: ${payload.data.error}`
      );
      return NextResponse.json({ received: true, action: "none" });

    default:
      console.warn(
        `[parallel/monitor/webhook] Unknown event type: ${payload.type}`
      );
      return NextResponse.json({ received: true, action: "none" });
  }
}

/**
 * Handle monitor.event.detected webhook
 * Fetches full event details and triggers agent workflow
 */
async function handleEventDetected(
  payload: MonitorWebhookPayload
): Promise<NextResponse> {
  const { monitor_id, event, metadata } = payload.data;

  if (!event?.event_group_id) {
    console.error("[parallel/monitor/webhook] Missing event_group_id in payload");
    return NextResponse.json(
      { error: "Missing event_group_id" },
      { status: 400 }
    );
  }

  // 1. Fetch full event details from Parallel API
  let eventGroup: MonitorEventGroup;
  try {
    eventGroup = await getMonitorEventGroup(monitor_id, event.event_group_id);
    console.log(
      `[parallel/monitor/webhook] Fetched ${eventGroup.events.length} events for group ${event.event_group_id}`
    );
  } catch (error) {
    console.error("[parallel/monitor/webhook] Failed to fetch event group:", error);
    return NextResponse.json(
      { error: "Failed to fetch event details" },
      { status: 500 }
    );
  }

  // 2. Extract structured output if available
  const structuredResult = eventGroup.events[0]?.result?.content as
    | NewsEventStructuredOutput
    | undefined;

  // 3. Build news event payload with enriched context for agent
  const newsPayload: NewsEventPayload = {
    monitor_id,
    event_group_id: event.event_group_id,
    metadata,
    events: eventGroup.events,
    context: {
      category: metadata?.category || structuredResult?.category,
      type: metadata?.type, // "breaking" or "daily"
      urgency: structuredResult?.urgency,
      sentiment: structuredResult?.sentiment,
      tradeable: structuredResult?.tradeable === "yes",
    },
  };

  // 4. Trigger agent with news event
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const vercelUrl = process.env.VERCEL_URL;

  if (!webhookSecret || !vercelUrl) {
    console.error(
      "[parallel/monitor/webhook] Missing WEBHOOK_SECRET or VERCEL_URL for agent trigger"
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
        triggerType: "news_event",
        newsEvent: newsPayload,
      }),
    });

    if (!triggerResponse.ok) {
      const errorText = await triggerResponse.text();
      console.error(
        `[parallel/monitor/webhook] Failed to trigger agent: ${triggerResponse.status} - ${errorText}`
      );
      return NextResponse.json({ received: true, triggered: false });
    }

    const triggerResult = await triggerResponse.json();
    console.log(
      `[parallel/monitor/webhook] Agent triggered: spawned=${triggerResult.spawned}, failed=${triggerResult.failed}`
    );

    return NextResponse.json({
      received: true,
      triggered: true,
      spawned: triggerResult.spawned,
    });
  } catch (error) {
    console.error("[parallel/monitor/webhook] Failed to trigger agent:", error);
    return NextResponse.json({ received: true, triggered: false });
  }
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /api/parallel/monitor/webhook
 *
 * Health check endpoint for webhook configuration
 */
export async function GET() {
  return NextResponse.json({
    status: "ready",
    message: "Parallel AI Monitor API webhook endpoint",
    configured: Boolean(PARALLEL_WEBHOOK_SECRET),
    eventTypes: [
      "monitor.event.detected",
      "monitor.execution.completed",
      "monitor.execution.failed",
    ],
  });
}
