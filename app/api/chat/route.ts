import { streamText, UIMessage, createIdGenerator } from "ai";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";
import { getModelById } from "@/config/models";
import { getModel } from "@/lib/ai/registry";
import {
  loadMessages,
  saveChat,
  generateSessionId,
  generateMessageId,
} from "@/lib/supabase/messages";

export const maxDuration = 60;

// ============================================================================
// Types
// ============================================================================

interface ChatRequest {
  /** The new message from the user (text content) */
  message: {
    role: "user";
    parts: Array<{ type: "text"; text: string }>;
  };
  /** Session ID (null for new conversations) */
  sessionId: string | null;
  /** Model to use */
  model?: string;
}

type SimpleMessage = { role: "user" | "assistant" | "system"; content: string };

// ============================================================================
// Message Conversion
// ============================================================================

function toSimpleMessages(messages: UIMessage[]): SimpleMessage[] {
  const result: SimpleMessage[] = [];

  for (const msg of messages) {
    // Extract text content from parts
    let content = "";
    if (msg.parts) {
      content = msg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    // Skip empty messages
    if (!content.trim()) continue;

    result.push({
      role: msg.role as "user" | "assistant",
      content,
    });
  }

  return result;
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(req: Request) {
  try {
    const {
      message,
      sessionId: clientSessionId,
      model = "aimo/gpt-oss-120b",
    }: ChatRequest = await req.json();

    // Validate API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate message
    if (!message || !message.parts || message.parts.length === 0) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine session ID (create new if not provided)
    const isNewSession = !clientSessionId;
    const sessionId = clientSessionId ?? generateSessionId();

    // Load previous messages from Supabase if existing session
    let previousMessages: UIMessage[] = [];
    if (!isNewSession) {
      try {
        previousMessages = await loadMessages(sessionId);
      } catch (error) {
        console.error("Failed to load previous messages:", error);
        // Continue with empty history if load fails
      }
    }

    // Create user message with server-generated ID
    const userMessage: UIMessage = {
      id: generateMessageId(),
      role: "user",
      parts: message.parts,
    };

    // Combine previous messages with new user message
    const messages: UIMessage[] = [...previousMessages, userMessage];

    // Convert to simple OpenAI format (content as string, not array)
    const simpleMessages = toSimpleMessages(messages);

    // Check if model supports image output
    const modelDef = getModelById(model);
    const supportsImageOutput = modelDef?.outputModalities?.includes("image");

    // Build experimental provider metadata for image-capable models
    const experimentalProviderMetadata =
      supportsImageOutput && modelDef
        ? {
            openai: {
              modalities: modelDef.outputModalities,
              ...(modelDef.imageSettings?.defaultAspectRatio && {
                image_config: {
                  aspect_ratio: modelDef.imageSettings.defaultAspectRatio,
                },
              }),
            },
          }
        : undefined;

    const result = streamText({
      model: getModel(model),
      system: DEFAULT_SYSTEM_PROMPT,
      messages: simpleMessages,
      providerOptions: experimentalProviderMetadata,
    });

    // Consume stream to ensure onFinish is called even on client disconnect
    result.consumeStream();

    // Return streaming response with server-side message ID generation
    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      // Generate consistent server-side IDs for AI messages
      generateMessageId: createIdGenerator({
        prefix: "msg",
        size: 16,
      }),
      onFinish: async ({ messages: finalMessages }) => {
        try {
          // Save all messages to Supabase
          await saveChat({
            sessionId,
            messages: finalMessages,
            modelId: model,
          });
        } catch (error) {
          console.error("Failed to save chat:", error);
        }
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);

    // Handle specific OpenAI errors
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
