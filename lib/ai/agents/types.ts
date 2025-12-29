import type {
  PositionSide,
  TradeAction,
  DecisionType,
  TriggerType,
} from "@/lib/supabase/types";

// =============================================================================
// Agent Configuration
// =============================================================================

/**
 * Configuration for creating a PredictionMarketAgent instance
 */
export interface AgentConfig {
  modelId: string;
  walletAddress: string;
  privateKey?: string;
  maxSteps?: number;
}

// =============================================================================
// Market Context (Input to Agent)
// =============================================================================

/**
 * A prediction market available for trading
 */
export interface MarketInfo {
  ticker: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  status: string;
}

/**
 * A position held by the agent
 */
export interface PositionInfo {
  marketTicker: string;
  marketTitle: string;
  side: PositionSide;
  quantity: number;
}

/**
 * Portfolio state for the agent
 */
export interface PortfolioInfo {
  cashBalance: number;
  totalValue: number;
  positions: PositionInfo[];
}

/**
 * A recent trade for context
 */
export interface TradeInfo {
  marketTicker: string;
  side: PositionSide;
  action: TradeAction;
  quantity: number;
  price: number;
}

/**
 * Price swing detected in a market
 */
export interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

/**
 * Market signal from PartyKit relay
 */
export interface MarketSignal {
  type: TriggerType;
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * Full context provided to the agent for decision making
 */
export interface MarketContext {
  availableMarkets: MarketInfo[];
  portfolio: PortfolioInfo;
  recentTrades: TradeInfo[];
  priceSwings: PriceSwing[];
}

// =============================================================================
// Agent Result (Output from Agent)
// =============================================================================

/**
 * A trade executed by the agent
 */
export interface ExecutedTrade {
  id: string;
  marketTicker: string;
  marketTitle?: string;
  side: PositionSide;
  action: TradeAction;
  quantity: number;
  price: number;
  notional: number;
}

/**
 * Result returned from PredictionMarketAgent.run()
 */
export interface TradingResult {
  reasoning: string;
  trades: ExecutedTrade[];
  decision: DecisionType;
  steps: number;
  portfolioValue: number;
  confidence?: number;
  marketTicker?: string;
  marketTitle?: string;
}
