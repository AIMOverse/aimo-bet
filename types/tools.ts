/**
 * Tool Types
 *
 * Types for MCP tools and built-in AI SDK tools.
 * Simplified from aimo-web-app (no auth-specific fields).
 */

// ============================================================================
// MCP Capabilities
// ============================================================================

/**
 * MCP tool capabilities
 */
export interface MCPCapabilities {
  /** Exposes MCP tools */
  tools?: boolean;
  /** Exposes MCP prompts */
  prompts?: boolean;
  /** Exposes MCP resources */
  resources?: boolean;
}

// ============================================================================
// MCP Tool Pricing
// ============================================================================

/**
 * Tool pricing configuration
 */
export interface MCPToolPricing {
  /** Price per individual tool call (in credits) */
  per_call?: number;
  /** Currency or unit (e.g., "credits", "USD") */
  currency?: string;
}

// ============================================================================
// MCP Tool Metadata
// ============================================================================

/**
 * Tool metadata configuration
 */
export interface MCPToolMetadata {
  /** Tool category (e.g., "data", "communication", "utilities") */
  category?: string;
  /** Tool tags for discovery */
  tags?: string[];
  /** Tool version */
  version?: string;
  /** Tool author */
  author?: string;
  /** Documentation URL */
  documentation_url?: string;
  /** Additional custom metadata */
  [key: string]: unknown;
}

// ============================================================================
// MCP Tool Info
// ============================================================================

/**
 * MCP Tool information from the registry
 */
export interface MCPToolInfo {
  /** Agent ID that owns this tool */
  agent_id: string;
  /** Agent display name */
  agent_name: string;
  /** Agent's wallet address for routing */
  agent_wallet_address?: string;
  /** MCP endpoint URL */
  endpoint: string;
  /** Routing key for the tool (optional) */
  routing_key?: string;
  /** MCP capabilities exposed by this endpoint */
  capabilities?: MCPCapabilities;
  /** Tool pricing configuration */
  pricing?: MCPToolPricing;
  /** Tool metadata */
  metadata?: MCPToolMetadata;
  /** Tool description */
  description?: string;
  /** ISO timestamp when tool was registered */
  created_at?: string;
  /** ISO timestamp when tool was last updated */
  updated_at?: string;
}

// ============================================================================
// Built-in Tool Types
// ============================================================================

/**
 * Configuration for built-in AI SDK tools
 */
export interface BuiltInToolConfig {
  /** Unique tool identifier */
  id: string;
  /** Display name */
  name: string;
  /** Tool description */
  description: string;
  /** Tool category */
  category: string;
  /** Whether enabled by default */
  enabled: boolean;
}

// ============================================================================
// Unified Tool Types (for UI)
// ============================================================================

/**
 * Tool source type
 */
export type ToolSource = "builtin" | "network" | "local";

/**
 * Unified tool item for UI display
 * Combines built-in and network tools into a common format
 */
export interface UnifiedToolItem {
  /** Unique identifier (id for builtin, agent_id for network) */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Category */
  category?: string;
  /** Source of the tool */
  source: ToolSource;
  /** MCP endpoint (for network tools) */
  endpoint?: string;
  /** Pricing info (for network tools) */
  pricing?: MCPToolPricing;
  /** Capabilities (for network tools) */
  capabilities?: MCPCapabilities;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from GET /api/tools
 */
export interface MCPToolsResponse {
  data: MCPToolInfo[];
}
