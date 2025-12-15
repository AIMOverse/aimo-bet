import { createOpenAI } from "@ai-sdk/openai";
import { streamText, UIMessage } from "ai";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";

// AiMo Network API configuration
const AIMO_BASE_URL = "https://devnet.aimo.network/api/v1";

export const maxDuration = 60;

// Convert UI messages to simple OpenAI format (content as string)
type SimpleMessage = { role: "user" | "assistant" | "system"; content: string };

function toSimpleMessages(messages: UIMessage[]): SimpleMessage[] {
  return messages
    .map((msg) => {
      // Extract text content from parts
      let content = "";
      if (msg.parts) {
        content = msg.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
      }
      // Skip empty messages
      if (!content.trim()) return null;
      return {
        role: msg.role as "user" | "assistant",
        content,
      };
    })
    .filter((m): m is SimpleMessage => m !== null);
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      model = "openai/gpt-4o",
    }: { messages: UIMessage[]; model?: string } = await req.json();

    // Validate API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AiMo API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate messages
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create OpenAI-compatible client pointing to AiMo Network
    const aimo = createOpenAI({
      baseURL: AIMO_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Convert to simple OpenAI format (content as string, not array)
    const simpleMessages = toSimpleMessages(messages);

    // Use .chat() to hit /chat/completions instead of /responses
    const result = streamText({
      model: aimo.chat(model),
      system: DEFAULT_SYSTEM_PROMPT,
      messages: simpleMessages,
    });

    return result.toUIMessageStreamResponse();
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
