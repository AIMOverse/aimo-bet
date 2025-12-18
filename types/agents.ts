/**
 * Agent Types
 *
 * Types for agent catalog and A2A protocol support.
 * Simplified from aimo-web-app (no auth-specific fields).
 */

// ============================================================================
// A2A Protocol Types
// ============================================================================

/**
 * A2A Protocol capabilities
 */
export interface A2ACapabilities {
  /** Supports streaming responses */
  streaming: boolean;
  /** Supports push notifications */
  pushNotifications: boolean;
  /** Supports state transition history */
  stateTransitionHistory: boolean;
}

/**
 * A2A Protocol skill definition
 */
export interface A2ASkill {
  /** Skill identifier */
  id: string;
  /** Skill display name */
  name: string;
  /** Skill description */
  description?: string;
  /** Skill tags */
  tags?: string[];
  /** Example inputs */
  examples?: string[];
  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>;
  /** Output schema (JSON Schema) */
  outputSchema?: Record<string, unknown>;
}

/**
 * A2A Protocol provider info
 */
export interface A2AProvider {
  /** Organization name */
  organization: string;
  /** Organization URL */
  url?: string;
}

/**
 * A2A Protocol agent card
 * Describes agent capabilities for agent-to-agent communication
 */
export interface A2ACard {
  /** Agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** Agent URL */
  url?: string;
  /** Agent version */
  version?: string;
  /** Provider information */
  provider?: A2AProvider;
  /** A2A protocol capabilities */
  capabilities: A2ACapabilities;
  /** Agent skills */
  skills: A2ASkill[];
  /** Default input content modes (e.g., "text", "image", "audio") */
  defaultInputModes: string[];
  /** Default output content modes (e.g., "text", "image", "audio") */
  defaultOutputModes: string[];
  /** Supported authentication methods */
  authentication?: {
    schemes: string[];
  };
}

// ============================================================================
// Agent Catalog Types
// ============================================================================

/**
 * Chat completion configuration for an agent
 */
export interface AgentChatCompletion {
  /** OpenAI-compatible chat endpoint */
  endpoint: string;
  /** Pricing info */
  pricing?: {
    per_million_tokens: number;
  };
}

/**
 * Agent catalog item (base fields)
 */
export interface AgentCatalogItem {
  /** Unique agent identifier (UUID) */
  agent_id: string;
  /** Agent display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional avatar/logo URL */
  image?: string;
  /** On-chain wallet address */
  agent_wallet_address: string;
  /** Chat completion config (if agent supports chat) */
  chat_completion?: AgentChatCompletion;
  /** ISO timestamp */
  created_at: string;
  /** ISO timestamp */
  updated_at: string;
}

/**
 * Extended agent catalog item with A2A card
 * Combines base catalog info with A2A protocol support
 */
export interface AgentCatalogItemWithA2A extends AgentCatalogItem {
  /** A2A protocol card (optional, only for A2A-enabled agents) */
  a2a_card?: A2ACard;
}

// ============================================================================
// Custom Agent Types (AI SDK aligned)
// ============================================================================

/**
 * Agent settings for AI SDK Agent class
 */
export interface CustomAgentSettings {
  /** Maximum steps for agent loop (stopWhen: stepCountIs(n)) */
  maxSteps?: number;
  /** Model temperature (0-2) */
  temperature?: number;
}

/**
 * Custom agent configuration
 * Aligned with AI SDK Agent class properties
 */
export interface CustomAgentConfig {
  /** Local UUID */
  id: string;
  /** Agent display name */
  name: string;
  /** Optional description */
  description?: string;

  // Core AI SDK Agent properties
  /** Model ID (e.g., "openai/gpt-4o") */
  modelId: string;
  /** Tool IDs to enable */
  tools: string[];
  /** System instruction/prompt */
  systemPrompt?: string;

  /** Agent settings */
  settings?: CustomAgentSettings;

  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
}

/**
 * Agent source type
 */
export type AgentSource = "preset" | "custom";

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from GET /api/agents
 */
export interface AgentCatalogResponse {
  data: AgentCatalogItemWithA2A[];
}
