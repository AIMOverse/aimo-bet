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
// Agent Input (Lean Context)
// =============================================================================

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
 * Lean input for agent run - only signal + balance
 * Agent discovers market details via tools for fresher data
 */
export interface AgentRunInput {
  signal?: MarketSignal;
  usdcBalance: number;
  /** When true, uses test prompt that forces a $1-5 trade */
  testMode?: boolean;
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
