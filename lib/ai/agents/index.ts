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
  // Market context (input)
  MarketInfo,
  PositionInfo,
  PortfolioInfo,
  TradeInfo,
  PriceSwing,
  MarketSignal,
  MarketContext,
  // Trading result (output)
  ExecutedTrade,
  TradingResult,
} from "./types";
