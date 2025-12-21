import {
  streamText,
  UIMessage,
  createIdGenerator,
  convertToModelMessages,
} from "ai";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";
import { getModelById } from "@/lib/ai/models/models";
import { getModel } from "@/lib/ai/registry";
import { generateImageTool, generateVideoTool } from "@/lib/ai/tools";
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
  /** Tools configuration */
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
      tools,
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

    // Determine session ID (create new if not provided)
    const finalSessionId = sessionId ?? generateSessionId();

    // Validate UUID format to prevent database errors
    const isValidUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        finalSessionId,
      );
    if (!isValidUUID) {
      return new Response(
        JSON.stringify({ error: "Invalid session ID format" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Load previous messages from DB and append new message
    const previousMessages = sessionId ? await loadMessages(sessionId) : [];
    const messages = [...previousMessages, message];

    // Check if model supports image output
    const modelDef = getModelById(model);
    const supportsImageOutput = modelDef?.outputModalities?.includes("image");

    // Build enabled tools object
    const enabledTools = {
      ...(tools?.generateImage && { generateImage: generateImageTool }),
      ...(tools?.generateVideo && { generateVideo: generateVideoTool }),
      // Future: add more tools here
    };

    console.log("[chat/route] Request tools config:", tools);
    console.log("[chat/route] Enabled tools:", Object.keys(enabledTools));

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

    const toolsToPass =
      Object.keys(enabledTools).length > 0 ? enabledTools : undefined;
    console.log(
      "[chat/route] Tools passed to streamText:",
      toolsToPass ? Object.keys(toolsToPass) : "none",
    );
    console.log("[chat/route] Model:", model);

    const result = streamText({
      model: getModel(model),
      system: DEFAULT_SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      providerOptions,
      tools: toolsToPass,
      onStepFinish: ({ toolCalls, toolResults }) => {
        console.log("[chat/route] Step finished:", {
          toolCalls: toolCalls?.length,
          toolResults: toolResults?.length,
        });
        if (toolCalls) {
          toolCalls.forEach((tc, i) => {
            if (tc && "toolName" in tc) {
              console.log(
                `[chat/route] Tool call ${i}:`,
                tc.toolName,
                "input" in tc ? tc.input : undefined,
              );
            }
          });
        }
      },
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
