import {
  UIMessage,
  createIdGenerator,
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { chatAgent } from "@/lib/ai/agents";
import {
  saveChat,
  loadMessages,
  generateSessionId,
} from "@/lib/supabase/messages";
import {
  getArenaChatMessages,
  saveArenaChatMessage,
} from "@/lib/supabase/arena";
import type { ArenaChatMessage, ArenaChatMetadata } from "@/types/chat";

// ============================================================================
// Types
// ============================================================================

type ChatMode = "user-chat" | "arena";

interface ChatRequest {
  message: UIMessage;
  sessionId: string | null;
  mode?: ChatMode;
  model?: string;
  tools?: {
    webSearch?: boolean;
  };
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(req: Request) {
  try {
    const {
      message,
      sessionId,
      mode = "user-chat",
      model = "openrouter/gpt-4o",
      tools = {},
    }: ChatRequest = await req.json();

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

    // Route to appropriate handler based on mode
    if (mode === "arena") {
      return handleArenaChat(req, message, sessionId);
    }

    return handleUserChat(message, sessionId, model, tools);
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
// User Chat Handler
// ============================================================================

async function handleUserChat(
  message: UIMessage,
  sessionId: string | null,
  model: string,
  tools: ChatRequest["tools"],
) {
  // Server generates session ID for new chats (single source of truth)
  const finalSessionId = sessionId ?? generateSessionId();
  const isNewSession = sessionId === null;

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

  // Load previous messages from DB and append new message
  const previousMessages = sessionId ? await loadMessages(sessionId) : [];
  const uiMessages = [...previousMessages, message];

  const generateMessageId = createIdGenerator({
    prefix: "msg",
    size: 16,
  });

  // Create the stream - session ID is sent via X-Session-Id header
  const stream = createUIMessageStream({
    generateId: generateMessageId,
    execute: async ({ writer }) => {
      // Stream response from agent
      const agentStream = await createAgentUIStream({
        agent: chatAgent,
        uiMessages,
        options: {
          model,
          mode: "user-chat",
          tools: {
            webSearch: tools?.webSearch ?? false,
          },
        },
      });

      // Pipe agent stream to the writer
      writer.merge(agentStream);
    },
    onFinish: async ({ messages: responseMessages }) => {
      try {
        // Combine user messages with AI response messages
        const allMessages = [...uiMessages, ...responseMessages];
        await saveChat({
          sessionId: finalSessionId,
          messages: allMessages,
          modelId: model,
        });
      } catch (error) {
        console.error("Failed to save chat:", error);
      }
    },
  });

  // Return the stream as a proper SSE response
  // Include session ID in header for new sessions (more reliable than transient data)
  return createUIMessageStreamResponse({
    stream,
    headers: isNewSession ? { "X-Session-Id": finalSessionId } : undefined,
  });
}

// ============================================================================
// Arena Chat Handler
// ============================================================================

async function handleArenaChat(
  req: Request,
  message: UIMessage,
  sessionId: string | null,
) {
  // Arena mode requires a trading session ID
  if (!sessionId) {
    return new Response(
      JSON.stringify({
        error: "Trading session ID is required for arena mode",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate UUID format
  const isValidUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      sessionId,
    );
  if (!isValidUUID) {
    return new Response(
      JSON.stringify({ error: "Invalid trading session ID format" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Get visitor ID from request (for user identification)
  const visitorId = getVisitorId(req);

  // Load recent arena messages for context
  const previousMessages = await getArenaChatMessages(sessionId, 50);

  // Create user message with metadata
  const userMessage: ArenaChatMessage = {
    ...message,
    metadata: {
      sessionId,
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
      // Stream response from agent in arena mode
      const agentStream = await createAgentUIStream({
        agent: chatAgent,
        uiMessages,
        options: {
          mode: "arena",
          model: "openrouter/gpt-4o-mini",
          tools: {
            webSearch: false,
          },
        },
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
              sessionId,
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
