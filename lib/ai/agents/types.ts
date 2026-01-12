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
 * Research context from Parallel Task API
 * Present when agent is triggered by research completion
 */
export interface ResearchContext {
  run_id: string;
  status: "completed" | "failed";
  content?: string;
  basis?: Array<{
    field: string;
    citations: Array<{ url: string; excerpt: string }>;
    confidence: number;
    reasoning: string;
  }>;
  error?: string;
}

/**
 * Configuration for creating a PredictionMarketAgent instance
 */
export interface AgentConfig {
  modelId: string;
  walletAddress: string;
  privateKey?: string;
  maxSteps?: number;
  /** Research context from Parallel (present when triggered by research completion) */
  researchContext?: ResearchContext;
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
 * Lean input for agent run - minimal context for KV cache optimization
 * Agent discovers balance and market details via tools for fresher data
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AgentRunInput {}

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
  /** Mint address for the outcome token (used for position tracking) */
  mint?: string;
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
