import { getSupabaseClient, isSupabaseConfigured } from "./client";
import type {
  ArenaModel,
  TradingSession,
  ModelPortfolio,
  Position,
  Trade,
  Broadcast,
  PerformanceSnapshot,
  SessionStatus,
  PositionSide,
  TradeAction,
  BroadcastType,
} from "@/types/arena";
import type { UIMessage } from "ai";
import type { ArenaChatMetadata, ArenaChatMessage } from "@/types/chat";
import { DEFAULT_STARTING_CAPITAL } from "@/lib/arena/constants";

// ============================================================================
// ARENA MODELS
// ============================================================================

export async function getArenaModels(enabledOnly = true): Promise<ArenaModel[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  let query = client
    .from("arena_models")
    .select("*")
    .order("name");

  if (enabledOnly) {
    query = query.eq("enabled", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch arena models:", error);
    throw error;
  }

  return (data || []).map(mapArenaModel);
}

export async function getArenaModel(id: string): Promise<ArenaModel | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("arena_models")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("Failed to fetch arena model:", error);
    throw error;
  }

  return data ? mapArenaModel(data) : null;
}

export async function createArenaModel(
  model: Omit<ArenaModel, "id" | "createdAt">
): Promise<ArenaModel> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { data, error } = await client
    .from("arena_models")
    .insert({
      name: model.name,
      provider: model.provider,
      model_identifier: model.modelIdentifier,
      wallet_address: model.walletAddress,
      avatar_url: model.avatarUrl,
      chart_color: model.chartColor,
      enabled: model.enabled,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create arena model:", error);
    throw error;
  }

  return mapArenaModel(data);
}

export async function updateArenaModel(
  id: string,
  updates: Partial<Omit<ArenaModel, "id" | "createdAt">>
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client
    .from("arena_models")
    .update({
      name: updates.name,
      provider: updates.provider,
      model_identifier: updates.modelIdentifier,
      wallet_address: updates.walletAddress,
      avatar_url: updates.avatarUrl,
      chart_color: updates.chartColor,
      enabled: updates.enabled,
    })
    .eq("id", id);

  if (error) {
    console.error("Failed to update arena model:", error);
    throw error;
  }
}

// ============================================================================
// TRADING SESSIONS
// ============================================================================

export async function getTradingSessions(): Promise<TradingSession[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("trading_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch trading sessions:", error);
    throw error;
  }

  return (data || []).map(mapTradingSession);
}

export async function getTradingSession(id: string): Promise<TradingSession | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("trading_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("Failed to fetch trading session:", error);
    throw error;
  }

  return data ? mapTradingSession(data) : null;
}

export async function getActiveSession(): Promise<TradingSession | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("trading_sessions")
    .select("*")
    .in("status", ["setup", "running", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("Failed to fetch active session:", error);
    throw error;
  }

  return data ? mapTradingSession(data) : null;
}

export async function createTradingSession(
  name?: string,
  startingCapital = DEFAULT_STARTING_CAPITAL
): Promise<TradingSession> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { data, error } = await client
    .from("trading_sessions")
    .insert({
      name,
      starting_capital: startingCapital,
      status: "setup",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create trading session:", error);
    throw error;
  }

  return mapTradingSession(data);
}

export async function updateSessionStatus(
  id: string,
  status: SessionStatus
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const updates: Record<string, unknown> = { status };
  if (status === "running") {
    updates.started_at = new Date().toISOString();
  } else if (status === "completed") {
    updates.ended_at = new Date().toISOString();
  }

  const { error } = await client
    .from("trading_sessions")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Failed to update session status:", error);
    throw error;
  }
}

// ============================================================================
// MODEL PORTFOLIOS
// ============================================================================

export async function getSessionPortfolios(sessionId: string): Promise<ModelPortfolio[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("model_portfolios")
    .select("*")
    .eq("session_id", sessionId);

  if (error) {
    console.error("Failed to fetch portfolios:", error);
    throw error;
  }

  return (data || []).map(mapModelPortfolio);
}

export async function createPortfoliosForSession(
  sessionId: string,
  startingCapital: number
): Promise<ModelPortfolio[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  // Get all enabled models
  const models = await getArenaModels(true);

  // Create portfolio for each model
  const portfolios = models.map((model) => ({
    session_id: sessionId,
    model_id: model.id,
    cash_balance: startingCapital,
  }));

  const { data, error } = await client
    .from("model_portfolios")
    .insert(portfolios)
    .select();

  if (error) {
    console.error("Failed to create portfolios:", error);
    throw error;
  }

  return (data || []).map(mapModelPortfolio);
}

export async function updatePortfolioCash(
  portfolioId: string,
  cashBalance: number
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client
    .from("model_portfolios")
    .update({ cash_balance: cashBalance })
    .eq("id", portfolioId);

  if (error) {
    console.error("Failed to update portfolio cash:", error);
    throw error;
  }
}

// ============================================================================
// POSITIONS
// ============================================================================

export async function getPortfolioPositions(
  portfolioId: string,
  openOnly = true
): Promise<Position[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  let query = client
    .from("positions")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("opened_at", { ascending: false });

  if (openOnly) {
    query = query.eq("status", "open");
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch positions:", error);
    throw error;
  }

  return (data || []).map(mapPosition);
}

export async function createPosition(
  portfolioId: string,
  position: {
    marketTicker: string;
    marketTitle: string;
    side: PositionSide;
    quantity: number;
    avgEntryPrice: number;
  }
): Promise<Position> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { data, error } = await client
    .from("positions")
    .insert({
      portfolio_id: portfolioId,
      market_ticker: position.marketTicker,
      market_title: position.marketTitle,
      side: position.side,
      quantity: position.quantity,
      avg_entry_price: position.avgEntryPrice,
      status: "open",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create position:", error);
    throw error;
  }

  return mapPosition(data);
}

export async function closePosition(positionId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client
    .from("positions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
    })
    .eq("id", positionId);

  if (error) {
    console.error("Failed to close position:", error);
    throw error;
  }
}

// ============================================================================
// TRADES
// ============================================================================

export async function getSessionTrades(
  sessionId: string,
  limit = 50
): Promise<Trade[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  // Get portfolios for this session first
  const portfolios = await getSessionPortfolios(sessionId);
  const portfolioIds = portfolios.map((p) => p.id);

  if (portfolioIds.length === 0) return [];

  const { data, error } = await client
    .from("trades")
    .select("*")
    .in("portfolio_id", portfolioIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch trades:", error);
    throw error;
  }

  return (data || []).map(mapTrade);
}

export async function createTrade(
  portfolioId: string,
  trade: {
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
  }
): Promise<Trade> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { data, error } = await client
    .from("trades")
    .insert({
      portfolio_id: portfolioId,
      position_id: trade.positionId,
      market_ticker: trade.marketTicker,
      market_title: trade.marketTitle,
      side: trade.side,
      action: trade.action,
      quantity: trade.quantity,
      price: trade.price,
      notional: trade.notional,
      pnl: trade.pnl,
      reasoning: trade.reasoning,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create trade:", error);
    throw error;
  }

  return mapTrade(data);
}

// ============================================================================
// BROADCASTS
// ============================================================================

export async function getSessionBroadcasts(
  sessionId: string,
  limit = 50
): Promise<Broadcast[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("broadcasts")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch broadcasts:", error);
    throw error;
  }

  return (data || []).map(mapBroadcast);
}

export async function createBroadcast(
  sessionId: string,
  modelId: string,
  broadcast: {
    type: BroadcastType;
    content: string;
    relatedTradeId?: string;
  }
): Promise<Broadcast> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { data, error } = await client
    .from("broadcasts")
    .insert({
      session_id: sessionId,
      model_id: modelId,
      type: broadcast.type,
      content: broadcast.content,
      related_trade_id: broadcast.relatedTradeId,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create broadcast:", error);
    throw error;
  }

  return mapBroadcast(data);
}

// ============================================================================
// ARENA CHAT MESSAGES
// ============================================================================

export async function getArenaChatMessages(
  sessionId: string,
  limit = 100
): Promise<ArenaChatMessage[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("arena_chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch arena chat messages:", error);
    throw error;
  }

  return (data || []).map(mapArenaChatMessage);
}

export async function saveArenaChatMessage(
  message: ArenaChatMessage
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client
    .from("arena_chat_messages")
    .upsert(
      {
        id: message.id,
        session_id: message.metadata?.sessionId,
        role: message.role,
        parts: message.parts,
        metadata: message.metadata,
      },
      { onConflict: "id" }
    );

  if (error) {
    console.error("Failed to save arena chat message:", error);
    throw error;
  }
}

export async function saveArenaChatMessages(
  messages: ArenaChatMessage[]
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const inserts = messages.map((msg) => ({
    id: msg.id,
    session_id: msg.metadata?.sessionId,
    role: msg.role,
    parts: msg.parts,
    metadata: msg.metadata,
  }));

  const { error } = await client
    .from("arena_chat_messages")
    .upsert(inserts, { onConflict: "id" });

  if (error) {
    console.error("Failed to save arena chat messages:", error);
    throw error;
  }
}

// ============================================================================
// PERFORMANCE SNAPSHOTS
// ============================================================================

export async function getPerformanceSnapshots(
  sessionId: string,
  hoursBack = 24
): Promise<PerformanceSnapshot[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("performance_snapshots")
    .select("*")
    .eq("session_id", sessionId)
    .gte("timestamp", since)
    .order("timestamp", { ascending: true });

  if (error) {
    console.error("Failed to fetch performance snapshots:", error);
    throw error;
  }

  return (data || []).map(mapPerformanceSnapshot);
}

export async function createPerformanceSnapshot(
  sessionId: string,
  modelId: string,
  accountValue: number
): Promise<PerformanceSnapshot> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { data, error } = await client
    .from("performance_snapshots")
    .insert({
      session_id: sessionId,
      model_id: modelId,
      account_value: accountValue,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create performance snapshot:", error);
    throw error;
  }

  return mapPerformanceSnapshot(data);
}

export async function createBulkSnapshots(
  snapshots: Array<{
    sessionId: string;
    modelId: string;
    accountValue: number;
  }>
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client.from("performance_snapshots").insert(
    snapshots.map((s) => ({
      session_id: s.sessionId,
      model_id: s.modelId,
      account_value: s.accountValue,
    }))
  );

  if (error) {
    console.error("Failed to create bulk snapshots:", error);
    throw error;
  }
}

// ============================================================================
// MAPPERS
// ============================================================================

function mapArenaModel(row: Record<string, unknown>): ArenaModel {
  return {
    id: row.id as string,
    name: row.name as string,
    provider: row.provider as string,
    modelIdentifier: row.model_identifier as string,
    walletAddress: row.wallet_address as string | undefined,
    avatarUrl: row.avatar_url as string | undefined,
    chartColor: row.chart_color as string,
    enabled: row.enabled as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

function mapTradingSession(row: Record<string, unknown>): TradingSession {
  return {
    id: row.id as string,
    name: row.name as string | undefined,
    status: row.status as SessionStatus,
    startingCapital: Number(row.starting_capital),
    startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
    endedAt: row.ended_at ? new Date(row.ended_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function mapModelPortfolio(row: Record<string, unknown>): ModelPortfolio {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    modelId: row.model_id as string,
    cashBalance: Number(row.cash_balance),
    createdAt: new Date(row.created_at as string),
  };
}

function mapPosition(row: Record<string, unknown>): Position {
  return {
    id: row.id as string,
    portfolioId: row.portfolio_id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: row.market_title as string,
    side: row.side as PositionSide,
    quantity: Number(row.quantity),
    avgEntryPrice: Number(row.avg_entry_price),
    status: row.status as "open" | "closed",
    openedAt: new Date(row.opened_at as string),
    closedAt: row.closed_at ? new Date(row.closed_at as string) : undefined,
  };
}

function mapTrade(row: Record<string, unknown>): Trade {
  return {
    id: row.id as string,
    portfolioId: row.portfolio_id as string,
    positionId: row.position_id as string | undefined,
    marketTicker: row.market_ticker as string,
    marketTitle: row.market_title as string,
    side: row.side as PositionSide,
    action: row.action as TradeAction,
    quantity: Number(row.quantity),
    price: Number(row.price),
    notional: Number(row.notional),
    pnl: row.pnl !== null ? Number(row.pnl) : undefined,
    reasoning: row.reasoning as string | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function mapBroadcast(row: Record<string, unknown>): Broadcast {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    modelId: row.model_id as string,
    type: row.type as BroadcastType,
    content: row.content as string,
    relatedTradeId: row.related_trade_id as string | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function mapPerformanceSnapshot(row: Record<string, unknown>): PerformanceSnapshot {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    modelId: row.model_id as string,
    accountValue: Number(row.account_value),
    timestamp: new Date(row.timestamp as string),
  };
}

function mapArenaChatMessage(row: Record<string, unknown>): ArenaChatMessage {
  return {
    id: row.id as string,
    role: row.role as "user" | "assistant",
    parts: row.parts as UIMessage["parts"],
    metadata: row.metadata as ArenaChatMetadata,
  };
}
