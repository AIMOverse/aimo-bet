// Arena model registered for trading
export interface ArenaModel {
  id: string;
  name: string;
  provider: string;
  modelIdentifier: string;
  avatarUrl?: string;
  chartColor: string;
  enabled: boolean;
  createdAt: Date;
}

// Trading session state
export type SessionStatus = 'setup' | 'running' | 'paused' | 'completed';

export interface TradingSession {
  id: string;
  name?: string;
  status: SessionStatus;
  startingCapital: number;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}

// Portfolio for a model in a session
export interface ModelPortfolio {
  id: string;
  sessionId: string;
  modelId: string;
  cashBalance: number;
  createdAt: Date;
}

// Extended portfolio with calculated values
export interface PortfolioState extends ModelPortfolio {
  positions: Position[];
  totalValue: number; // cashBalance + positions value
  unrealizedPnl: number;
}

// Prediction market data
export type MarketStatus = 'open' | 'closed' | 'settled';

export interface PredictionMarket {
  ticker: string;
  title: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  expirationDate: Date;
  status: MarketStatus;
}

// Position in a market
export type PositionSide = 'yes' | 'no';
export type PositionStatus = 'open' | 'closed';

export interface Position {
  id: string;
  portfolioId: string;
  marketTicker: string;
  marketTitle: string;
  side: PositionSide;
  quantity: number;
  avgEntryPrice: number;
  status: PositionStatus;
  openedAt: Date;
  closedAt?: Date;
  // Calculated fields
  currentPrice?: number;
  currentValue?: number;
  unrealizedPnl?: number;
}

// Trade execution record
export type TradeAction = 'buy' | 'sell';

export interface Trade {
  id: string;
  portfolioId: string;
  positionId?: string;
  marketTicker: string;
  marketTitle: string;
  side: PositionSide;
  action: TradeAction;
  quantity: number;
  price: number;
  notional: number;
  pnl?: number;
  reasoning?: string;
  createdAt: Date;
}

// Extended trade with model info for display
export interface TradeWithModel extends Trade {
  model: ArenaModel;
}

// Model broadcast/reasoning
export type BroadcastType = 'analysis' | 'trade' | 'commentary';

export interface Broadcast {
  id: string;
  sessionId: string;
  modelId: string;
  type: BroadcastType;
  content: string;
  relatedTradeId?: string;
  createdAt: Date;
}

// Extended broadcast with model info for display
export interface BroadcastWithModel extends Broadcast {
  model: ArenaModel;
}

// Performance snapshot for charts
export interface PerformanceSnapshot {
  id: string;
  sessionId: string;
  modelId: string;
  accountValue: number;
  timestamp: Date;
}

// Chart data point for recharts
export interface ChartDataPoint {
  timestamp: string;
  [modelId: string]: number | string;
}

// Market analysis by an agent
export interface MarketAnalysis {
  marketTicker: string;
  marketTitle: string;
  confidence: number; // 0-1
  predictedOutcome: PositionSide;
  reasoning: string;
  suggestedPosition?: {
    side: PositionSide;
    quantity: number;
    maxPrice: number;
  };
}

// Trading decision made by an agent
export type DecisionAction = 'buy' | 'sell' | 'hold';

export interface TradingDecision {
  action: DecisionAction;
  marketTicker?: string;
  side?: PositionSide;
  quantity?: number;
  limitPrice?: number;
  reasoning: string;
  confidence: number;
}

// Agent configuration
export interface PredictionMarketAgentConfig {
  modelId: string;
  modelIdentifier: string;
  portfolioId: string;
  sessionId: string;
}

// Context provided to agents for decision making
export interface MarketContext {
  availableMarkets: PredictionMarket[];
  portfolio: PortfolioState;
  recentTrades: Trade[];
  recentBroadcasts: Broadcast[];
}

// Agent execution result
export interface AgentExecutionResult {
  decision: TradingDecision;
  broadcast: string;
  trade?: Trade;
}

// Leaderboard entry
export interface LeaderboardEntry {
  model: ArenaModel;
  portfolio: PortfolioState;
  rank: number;
  change: number; // Position change since last update
  returnPercent: number; // (totalValue - startingCapital) / startingCapital * 100
}

// Arena tab types
export type ArenaTab = 'performance' | 'trades' | 'chat' | 'positions';

// Filter options for trades
export interface TradeFilter {
  modelId?: string;
  action?: TradeAction;
  side?: PositionSide;
}
