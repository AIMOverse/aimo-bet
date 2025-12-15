import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages, model = "gpt-4o" } = await req.json();

    // Validate API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate messages
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Messages are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Add system message if not present
    const hasSystemMessage = messages.some(
      (m: { role: string }) => m.role === "system"
    );
    const messagesWithSystem = hasSystemMessage
      ? messages
      : [{ role: "system", content: DEFAULT_SYSTEM_PROMPT }, ...messages];

    const result = await streamText({
      model: openai(model),
      messages: messagesWithSystem,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);

    // Handle specific OpenAI errors
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return new Response(
          JSON.stringify({ error: "Invalid API key" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      if (error.message.includes("rate limit")) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded" }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
