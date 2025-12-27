import type {
  PortfolioState,
  PredictionMarket,
  Trade,
  Broadcast,
  PositionSide,
} from "@/lib/supabase/types";

// =============================================================================
// Agent Configuration Types
// =============================================================================

/**
 * Configuration for a prediction market trading agent
 */
export interface PredictionMarketAgentConfig {
  modelId: string;
  modelIdentifier: string;
  walletAddress: string; // Agent's trading wallet (public address)
  walletPrivateKey?: string; // Private key for signing transactions (server-side only)
  sessionId: string;
}

// =============================================================================
// Agent Context Types
// =============================================================================

/**
 * Context provided to agents for decision making
 */
export interface MarketContext {
  availableMarkets: PredictionMarket[];
  portfolio: PortfolioState;
  recentTrades: Trade[];
  recentBroadcasts: Broadcast[];
}

// =============================================================================
// Agent Decision Types
// =============================================================================

export type DecisionAction = "buy" | "sell" | "hold";

/**
 * Trading decision made by an agent
 */
export interface TradingDecision {
  action: DecisionAction;
  marketTicker?: string;
  side?: PositionSide;
  quantity?: number;
  limitPrice?: number;
  reasoning: string;
  confidence: number;
}

// =============================================================================
// Agent Execution Types
// =============================================================================

/**
 * Result of an agent execution run
 */
export interface AgentExecutionResult {
  decision: TradingDecision;
  broadcast: string;
  trade?: Trade;
}
