import type { UIMessage } from "ai";

// =============================================================================
// Chat Types
// =============================================================================

/**
 * Author types for chat messages
 */
export type ChatAuthorType = "model" | "user" | "assistant";

/**
 * Message types for chat
 */
export type ChatMessageType =
  | "analysis"
  | "trade"
  | "commentary"
  | "user"
  | "assistant";

/**
 * Custom metadata for chat messages.
 * Follows ai-sdk patterns by extending UIMessage with typed metadata.
 */
export interface ChatMetadata {
  /** Trading session ID (trading_sessions.id) */
  sessionId: string;
  /** Who authored the message */
  authorType: ChatAuthorType;
  /** Identifier for the author (model_id, visitorIP, or 'assistant') */
  authorId: string;
  /** Type of message content */
  messageType: ChatMessageType;
  /** Related trade ID if this is a trade message */
  relatedTradeId?: string;
  /** Timestamp in milliseconds */
  createdAt: number;
}

/**
 * Chat message = UIMessage with our custom metadata
 */
export type ChatMessage = UIMessage & {
  metadata?: ChatMetadata;
};

/**
 * Author display information for rendering
 */
export interface ChatAuthor {
  name: string;
  avatarUrl?: string;
  color?: string;
}

/**
 * Chat message with author display info for rendering
 */
export interface ChatMessageWithAuthor extends ChatMessage {
  author: ChatAuthor;
}

// =============================================================================
// Session & Arena Types
// =============================================================================

export type SessionStatus = "setup" | "running" | "paused" | "completed";

export interface TradingSession {
  id: string;
  name?: string;
  status: SessionStatus;
  startingCapital: number;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}

// Arena model registered for trading
export interface ArenaModel {
  id: string;
  name: string;
  provider: string;
  modelIdentifier: string;
  walletAddress?: string; // Public wallet address for on-chain trading
  avatarUrl?: string;
  chartColor: string;
  enabled: boolean;
  createdAt: Date;
}

// =============================================================================
// Market Types
// =============================================================================

export type MarketStatus = "open" | "closed" | "settled";

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

// =============================================================================
// Portfolio & Position Types
// =============================================================================

export interface ModelPortfolio {
  id: string;
  sessionId: string;
  modelId: string;
  cashBalance: number;
  createdAt: Date;
}

export type PositionSide = "yes" | "no";
export type PositionStatus = "open" | "closed";

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

// Extended portfolio with calculated values
export interface PortfolioState extends ModelPortfolio {
  positions: Position[];
  totalValue: number; // cashBalance + positions value
  unrealizedPnl: number;
}

// =============================================================================
// Trade Types
// =============================================================================

export type TradeAction = "buy" | "sell";

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

export interface TradeFilter {
  modelId?: string;
  action?: TradeAction;
  side?: PositionSide;
}

// =============================================================================
// Broadcast Types
// =============================================================================

export type BroadcastType = "analysis" | "trade" | "commentary";

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

// =============================================================================
// Performance & Leaderboard Types
// =============================================================================

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

// Leaderboard entry
export interface LeaderboardEntry {
  model: ArenaModel;
  portfolio: PortfolioState;
  rank: number;
  change: number; // Position change since last update
  returnPercent: number; // (totalValue - startingCapital) / startingCapital * 100
}

// =============================================================================
// UI Types
// =============================================================================

export type ArenaTab = "performance" | "trades" | "chat" | "positions";

// =============================================================================
// Workflow Types
// =============================================================================

// Price swing detected by the price watcher
export interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

// =============================================================================
// Supabase Database Row Types (snake_case for DB)
// =============================================================================

export interface DbTradingSession {
  id: string;
  name: string | null;
  status: SessionStatus;
  starting_capital: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface DbTradingSessionInsert {
  id?: string;
  name?: string | null;
  status?: SessionStatus;
  starting_capital: number;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
}

export interface DbPerformanceSnapshot {
  id: string;
  session_id: string;
  model_id: string;
  account_value: number;
  timestamp: string;
}

export interface DbPerformanceSnapshotInsert {
  id?: string;
  session_id: string;
  model_id: string;
  account_value: number;
  timestamp?: string;
}

export interface DbArenaChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  parts: UIMessage["parts"];
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbArenaChatMessageInsert {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  parts: UIMessage["parts"];
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

// =============================================================================
// Supabase Database Type Definition
// =============================================================================

type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      trading_sessions: {
        Row: DbTradingSession;
        Insert: DbTradingSessionInsert;
        Update: Partial<DbTradingSessionInsert>;
        Relationships: GenericRelationship[];
      };
      performance_snapshots: {
        Row: DbPerformanceSnapshot;
        Insert: DbPerformanceSnapshotInsert;
        Update: Partial<DbPerformanceSnapshotInsert>;
        Relationships: GenericRelationship[];
      };
      arena_chat_messages: {
        Row: DbArenaChatMessage;
        Insert: DbArenaChatMessageInsert;
        Update: Partial<DbArenaChatMessageInsert>;
        Relationships: GenericRelationship[];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
