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

// ============================================================================
// Types
// ============================================================================

interface ChatRequest {
  message: UIMessage;
  sessionId: string | null;
  model?: string;
  tools?: {
    generateImage?: boolean;
    generateVideo?: boolean;
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
            tools: {
              generateImage: tools.generateImage ?? false,
              generateVideo: tools.generateVideo ?? false,
              webSearch: tools.webSearch ?? false,
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
