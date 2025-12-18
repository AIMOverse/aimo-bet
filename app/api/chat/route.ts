import { createOpenAI } from "@ai-sdk/openai";
import { streamText, UIMessage, ToolSet } from "ai";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";
import { BUILT_IN_TOOLS } from "@/config/tools";
import { getModelById } from "@/config/models";
import {
  connectToMCPServer,
  getToolEndpoint,
  MCPClientWrapper,
} from "@/lib/mcp";

// AiMo Network API configuration
const AIMO_BASE_URL = "https://devnet.aimo.network/api/v1";

export const maxDuration = 60;

// ============================================================================
// Types
// ============================================================================

interface ChatRequest {
  messages: UIMessage[];
  model?: string;
  enabledTools?: string[];
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
// Tool Setup
// ============================================================================

/**
 * Set up tools for the chat request.
 * Returns the tools object and a list of MCP clients to close after the request.
 */
async function setupTools(enabledTools: string[]): Promise<{
  tools: ToolSet;
  mcpClients: MCPClientWrapper[];
}> {
  const tools: ToolSet = {};
  const mcpClients: MCPClientWrapper[] = [];

  if (enabledTools.length === 0) {
    return { tools, mcpClients };
  }

  // Separate built-in tools from network tools
  const builtInToolIds = Object.keys(BUILT_IN_TOOLS);

  for (const toolId of enabledTools) {
    // Add built-in tools
    if (builtInToolIds.includes(toolId)) {
      const builtInTool = BUILT_IN_TOOLS[toolId as keyof typeof BUILT_IN_TOOLS];
      if (builtInTool) {
        tools[toolId] = builtInTool;
      }
      continue;
    }

    // Connect to network tools (MCP endpoints)
    try {
      const endpoint = await getToolEndpoint(toolId);
      if (endpoint) {
        const mcpClient = await connectToMCPServer({
          type: "http",
          url: endpoint,
        });
        mcpClients.push(mcpClient);

        // Get tools from the MCP server
        const mcpTools = await mcpClient.tools();
        Object.assign(tools, mcpTools);
      }
    } catch (error) {
      console.error(`Failed to connect to MCP tool ${toolId}:`, error);
      // Continue without this tool - don't fail the entire request
    }
  }

  return { tools, mcpClients };
}

/**
 * Clean up MCP clients after request completes
 */
async function cleanupMCPClients(clients: MCPClientWrapper[]): Promise<void> {
  await Promise.all(
    clients.map((client) =>
      client.close().catch((error) => {
        console.error("Error closing MCP client:", error);
      }),
    ),
  );
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(req: Request) {
  let mcpClients: MCPClientWrapper[] = [];

  try {
    const {
      messages,
      model = "openai/gpt-4o",
      enabledTools = [],
    }: ChatRequest = await req.json();

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

    // Set up tools
    const { tools, mcpClients: clients } = await setupTools(enabledTools);
    mcpClients = clients;

    // Create OpenAI-compatible client pointing to AiMo Network
    const aimo = createOpenAI({
      baseURL: AIMO_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Convert to simple OpenAI format (content as string, not array)
    const simpleMessages = toSimpleMessages(messages);

    // Stream the response with tools if any are enabled
    const hasTools = Object.keys(tools).length > 0;

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
      model: aimo.chat(model),
      system: DEFAULT_SYSTEM_PROMPT,
      messages: simpleMessages,
      tools: hasTools ? tools : undefined,
      providerOptions: experimentalProviderMetadata,
      onFinish: async () => {
        // Clean up MCP clients when streaming completes
        await cleanupMCPClients(mcpClients);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    // Ensure MCP clients are cleaned up on error
    await cleanupMCPClients(mcpClients);

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
