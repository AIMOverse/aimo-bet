// =============================================================================
// AI Agents
// =============================================================================

// PredictionMarketAgent - AI-SDK based trading agent
// Uses generateText (NOT durable) for LLM reasoning and tool execution
export { PredictionMarketAgent } from "./predictionMarketAgent";

// Types
export type {
  // Configuration
  AgentConfig,
  // Agent input (lean context)
  AgentRunInput,
  MarketSignal,
  // Trading result (output)
  ExecutedTrade,
  TradingResult,
} from "./types";
