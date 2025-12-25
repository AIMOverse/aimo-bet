import {
  UIMessage,
  createIdGenerator,
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { chatAgent } from "@/lib/ai/agents";
import {
  getGlobalSession,
  getArenaChatMessages,
  saveArenaChatMessage,
} from "@/lib/supabase/arena";
import type { ArenaChatMessage } from "@/types/chat";

// ============================================================================
// Types
// ============================================================================

interface ChatRequest {
  message: UIMessage;
  sessionId?: string | null;
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(req: Request) {
  try {
    const { message, sessionId }: ChatRequest = await req.json();

    // Validate message
    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get session - use global session if none provided
    let finalSessionId = sessionId;
    if (!finalSessionId) {
      const globalSession = await getGlobalSession();
      finalSessionId = globalSession.id;
    }

    // Validate UUID format
    const isValidUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        finalSessionId,
      );
    if (!isValidUUID) {
      return new Response(
        JSON.stringify({ error: "Invalid session ID format" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get visitor ID from request
    const visitorId = getVisitorId(req);

    // Load recent arena messages for context
    const previousMessages = await getArenaChatMessages(finalSessionId, 50);

    // Create user message with metadata
    const userMessage: ArenaChatMessage = {
      ...message,
      metadata: {
        sessionId: finalSessionId,
        authorType: "user",
        authorId: visitorId,
        messageType: "user",
        createdAt: Date.now(),
      },
    };

    // Save user message
    await saveArenaChatMessage(userMessage);

    const uiMessages = [...previousMessages, userMessage];

    const generateMessageId = createIdGenerator({
      prefix: "arena-msg",
      size: 16,
    });

    // Create the stream
    const stream = createUIMessageStream({
      generateId: generateMessageId,
      execute: async ({ writer }) => {
        // Stream response from agent
        const agentStream = await createAgentUIStream({
          agent: chatAgent,
          uiMessages,
          options: {},
        });

        writer.merge(agentStream);
      },
      onFinish: async ({ messages: responseMessages }) => {
        try {
          // Save assistant response messages with metadata
          for (const msg of responseMessages) {
            const arenaMessage: ArenaChatMessage = {
              ...msg,
              metadata: {
                sessionId: finalSessionId,
                authorType: "assistant",
                authorId: "assistant",
                messageType: "assistant",
                createdAt: Date.now(),
              },
            };
            await saveArenaChatMessage(arenaMessage);
          }
        } catch (error) {
          console.error("Failed to save arena chat:", error);
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Chat API error:", error);
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (error.message.includes("rate limit")) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get a visitor identifier from the request.
 * Uses IP address as fallback identifier.
 */
function getVisitorId(req: Request): string {
  // Try common headers for client IP
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to anonymous
  return "anonymous";
}
