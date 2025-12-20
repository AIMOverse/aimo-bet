import {
  streamText,
  UIMessage,
  createIdGenerator,
  convertToModelMessages,
} from "ai";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";
import { getModelById } from "@/config/models";
import { getModel } from "@/lib/ai/registry";
import {
  saveChat,
  loadMessages,
  generateSessionId,
} from "@/lib/supabase/messages";

// ============================================================================
// Types
// ============================================================================

interface ChatRequest {
  /** Single new message from client */
  message: UIMessage;
  /** Session ID (null for new conversations) */
  sessionId: string | null;
  /** Model to use */
  model?: string;
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(req: Request) {
  try {
    const {
      message,
      sessionId,
      model = "aimo/gpt-oss-120b",
    }: ChatRequest = await req.json();

    // Validate message
    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine session ID (create new if not provided)
    const finalSessionId = sessionId ?? generateSessionId();

    // Load previous messages from DB and append new message
    const previousMessages = sessionId ? await loadMessages(sessionId) : [];
    const messages = [...previousMessages, message];

    // Check if model supports image output
    const modelDef = getModelById(model);
    const supportsImageOutput = modelDef?.outputModalities?.includes("image");

    // Build experimental provider metadata for image-capable models
    const providerOptions =
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
      messages: await convertToModelMessages(messages),
      providerOptions,
    });

    // Consume stream to ensure onFinish is called even on client disconnect
    result.consumeStream();

    // Return streaming response with server-side message ID generation
    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: createIdGenerator({
        prefix: "msg",
        size: 16,
      }),
      onFinish: async ({ messages: finalMessages }) => {
        try {
          await saveChat({
            sessionId: finalSessionId,
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
