/**
 * MCP Client Factory
 *
 * Creates MCP clients using the AI SDK's experimental MCP support.
 * Supports both HTTP and stdio transports.
 */

import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";

// ============================================================================
// Types
// ============================================================================

export interface MCPServerConfig {
  /** Transport type */
  type: "http" | "stdio";
  /** HTTP endpoint URL (for http type) */
  url?: string;
  /** Command to run (for stdio type) */
  command?: string;
  /** Command arguments (for stdio type) */
  args?: string[];
  /** HTTP headers (for http type) */
  headers?: Record<string, string>;
}

export interface MCPClientWrapper {
  /** Get tools from the MCP server */
  tools: () => Promise<Record<string, unknown>>;
  /** Close the MCP client connection */
  close: () => Promise<void>;
}

// ============================================================================
// MCP Client Factory
// ============================================================================

/**
 * Connect to an MCP server and return a client wrapper.
 *
 * @param config - MCP server configuration
 * @returns MCP client wrapper with tools() and close() methods
 */
export async function connectToMCPServer(
  config: MCPServerConfig
): Promise<MCPClientWrapper> {
  if (config.type === "http" && config.url) {
    const client = await createMCPClient({
      transport: {
        type: "http",
        url: config.url,
        headers: config.headers,
      },
    });

    return {
      tools: () => client.tools(),
      close: () => client.close(),
    };
  }

  if (config.type === "stdio" && config.command) {
    // Import stdio transport only when needed (server-side only)
    // This dynamic import prevents bundling issues in the browser
    const { Experimental_StdioMCPTransport } = await import(
      "@ai-sdk/mcp/mcp-stdio"
    );

    const client = await createMCPClient({
      transport: new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args || [],
      }),
    });

    return {
      tools: () => client.tools(),
      close: () => client.close(),
    };
  }

  throw new Error(
    "Invalid MCP server configuration: must specify either url (http) or command (stdio)"
  );
}

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Get local MCP server configuration from environment variables.
 * Supports both HTTP and stdio configurations.
 *
 * Environment variables:
 * - MCP_MEMORY_SERVER_URL: HTTP endpoint URL
 * - MCP_MEMORY_SERVER_COMMAND: Command to run for stdio transport
 * - MCP_MEMORY_SERVER_ARGS: Space-separated arguments for the command
 *
 * @returns MCP server configuration or null if not configured
 */
export function getLocalMCPConfig(): MCPServerConfig | null {
  const url = process.env.MCP_MEMORY_SERVER_URL;
  const command = process.env.MCP_MEMORY_SERVER_COMMAND;

  if (url) {
    return {
      type: "http",
      url,
    };
  }

  if (command) {
    const args = process.env.MCP_MEMORY_SERVER_ARGS?.split(" ").filter(Boolean);
    return {
      type: "stdio",
      command,
      args,
    };
  }

  return null;
}

/**
 * Check if local MCP server is configured
 */
export function hasLocalMCPConfig(): boolean {
  return !!(
    process.env.MCP_MEMORY_SERVER_URL ||
    process.env.MCP_MEMORY_SERVER_COMMAND
  );
}

// ============================================================================
// Tool Registry Cache
// ============================================================================

// Simple in-memory cache for tool endpoints
const toolEndpointCache = new Map<string, { endpoint: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get tool endpoint from cache or fetch from registry.
 *
 * @param toolId - Tool/agent ID
 * @param registryUrl - Base URL for the tools registry
 * @returns Tool endpoint URL or null if not found
 */
export async function getToolEndpoint(
  toolId: string,
  registryUrl: string = "https://devnet.aimo.network/api/v1"
): Promise<string | null> {
  const now = Date.now();
  const cached = toolEndpointCache.get(toolId);

  if (cached && cached.expiresAt > now) {
    return cached.endpoint;
  }

  try {
    const response = await fetch(`${registryUrl}/tools`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch tools registry: ${response.status}`);
      return null;
    }

    const { data } = await response.json();

    // Cache all tool endpoints
    for (const tool of data) {
      toolEndpointCache.set(tool.agent_id, {
        endpoint: tool.endpoint,
        expiresAt: now + CACHE_TTL,
      });
    }

    const tool = data.find((t: { agent_id: string }) => t.agent_id === toolId);
    return tool?.endpoint ?? null;
  } catch (error) {
    console.error(`Failed to get tool endpoint for ${toolId}:`, error);
    return null;
  }
}

/**
 * Clear the tool endpoint cache
 */
export function clearToolEndpointCache(): void {
  toolEndpointCache.clear();
}
