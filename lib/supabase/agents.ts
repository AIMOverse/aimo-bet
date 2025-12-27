/**
 * Agent database functions for recording decisions, trades, and managing sessions.
 */

import { createServerClient } from "./server";
import { mapDbToAgentSession } from "./transforms";
import type {
  AgentSession,
  AgentDecision,
  AgentTrade,
  DbAgentSessionInsert,
  DbAgentDecisionInsert,
  DbAgentTradeInsert,
  TriggerType,
  DecisionType,
  PositionSide,
  TradeAction,
} from "./types";

// ============================================================================
// Agent Sessions
// ============================================================================

/**
 * Get or create an agent session for a model in a trading session
 */
export async function getOrCreateAgentSession(
  sessionId: string,
  modelId: string,
  modelName: string,
  walletAddress: string,
  startingCapital = 10000
): Promise<AgentSession> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  // Try to find existing session
  const { data: existing, error: findError } = await client
    .from("agent_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("model_id", modelId)
    .single();

  if (existing && !findError) {
    return mapDbToAgentSession(existing as Record<string, unknown>) as AgentSession;
  }

  // Create new session
  const insertData: DbAgentSessionInsert = {
    session_id: sessionId,
    model_id: modelId,
    model_name: modelName,
    wallet_address: walletAddress,
    starting_capital: startingCapital,
    current_value: startingCapital,
    total_pnl: 0,
    status: "active",
  };

  const { data: newSession, error: createError } = await client
    .from("agent_sessions")
    .insert(insertData as never)
    .select()
    .single();

  if (createError || !newSession) {
    console.error("[agents] Failed to create agent session:", createError);
    throw createError ?? new Error("Failed to create agent session");
  }

  console.log(`[agents] Created agent session for ${modelId}`);
  return mapDbToAgentSession(newSession as Record<string, unknown>) as AgentSession;
}

/**
 * Get all agent sessions for a trading session
 */
export async function getAgentSessions(
  sessionId: string
): Promise<AgentSession[]> {
  const client = createServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("agent_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .order("current_value", { ascending: false });

  if (error) {
    console.error("[agents] Failed to fetch agent sessions:", error);
    return [];
  }

  return (data || []).map(
    (row: Record<string, unknown>) => mapDbToAgentSession(row) as AgentSession
  );
}

/**
 * Update agent session's current value and P&L
 */
export async function updateAgentSessionValue(
  agentSessionId: string,
  currentValue: number,
  totalPnl: number
): Promise<void> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client
    .from("agent_sessions")
    .update({ current_value: currentValue, total_pnl: totalPnl } as never)
    .eq("id", agentSessionId);

  if (error) {
    console.error("[agents] Failed to update agent session:", error);
    throw error;
  }
}

// ============================================================================
// Agent Decisions
// ============================================================================

export interface RecordDecisionInput {
  agentSessionId: string;
  triggerType: TriggerType;
  triggerDetails?: Record<string, unknown>;
  marketTicker?: string;
  marketTitle?: string;
  decision: DecisionType;
  reasoning: string;
  confidence?: number;
  marketContext?: Record<string, unknown>;
  portfolioValueAfter: number;
}

/**
 * Record an agent decision to the database
 */
export async function recordAgentDecision(
  input: RecordDecisionInput
): Promise<AgentDecision> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const insertData: DbAgentDecisionInsert = {
    agent_session_id: input.agentSessionId,
    trigger_type: input.triggerType,
    trigger_details: input.triggerDetails ?? null,
    market_ticker: input.marketTicker ?? null,
    market_title: input.marketTitle ?? null,
    decision: input.decision,
    reasoning: input.reasoning,
    confidence: input.confidence ?? null,
    market_context: input.marketContext ?? null,
    portfolio_value_after: input.portfolioValueAfter,
  };

  const { data, error } = await client
    .from("agent_decisions")
    .insert(insertData as never)
    .select()
    .single();

  if (error || !data) {
    console.error("[agents] Failed to record decision:", error);
    throw error ?? new Error("Failed to record decision");
  }

  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    agentSessionId: row.agent_session_id as string,
    triggerType: row.trigger_type as TriggerType,
    triggerDetails: (row.trigger_details as Record<string, unknown>) ?? undefined,
    marketTicker: (row.market_ticker as string) ?? undefined,
    marketTitle: (row.market_title as string) ?? undefined,
    decision: row.decision as DecisionType,
    reasoning: row.reasoning as string,
    confidence: (row.confidence as number) ?? undefined,
    marketContext: (row.market_context as Record<string, unknown>) ?? undefined,
    portfolioValueAfter: row.portfolio_value_after as number,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Get recent decisions for a trading session (for chat feed)
 */
export async function getDecisions(
  sessionId: string,
  limit = 100
): Promise<
  Array<{
    decision: AgentDecision;
    agentSession: { sessionId: string; modelId: string; modelName: string };
    trades: AgentTrade[];
  }>
> {
  const client = createServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("agent_decisions")
    .select(
      `
      *,
      agent_sessions!inner(session_id, model_id, model_name),
      agent_trades(id, side, action, quantity, price, notional)
    `
    )
    .eq("agent_sessions.session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[agents] Failed to fetch decisions:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => {
    const agentSessions = row.agent_sessions as {
      session_id: string;
      model_id: string;
      model_name: string;
    };
    const agentTrades = (row.agent_trades as Array<{
      id: string;
      side: "yes" | "no";
      action: "buy" | "sell";
      quantity: number;
      price: number;
      notional: number;
    }>) || [];

    return {
      decision: {
        id: row.id as string,
        agentSessionId: row.agent_session_id as string,
        triggerType: row.trigger_type as TriggerType,
        triggerDetails: (row.trigger_details as Record<string, unknown>) ?? undefined,
        marketTicker: (row.market_ticker as string) ?? undefined,
        marketTitle: (row.market_title as string) ?? undefined,
        decision: row.decision as DecisionType,
        reasoning: row.reasoning as string,
        confidence: (row.confidence as number) ?? undefined,
        marketContext: (row.market_context as Record<string, unknown>) ?? undefined,
        portfolioValueAfter: row.portfolio_value_after as number,
        createdAt: new Date(row.created_at as string),
      },
      agentSession: {
        sessionId: agentSessions.session_id,
        modelId: agentSessions.model_id,
        modelName: agentSessions.model_name,
      },
      trades: agentTrades.map((t) => ({
        id: t.id,
        decisionId: row.id as string,
        agentSessionId: row.agent_session_id as string,
        marketTicker: (row.market_ticker as string) || "",
        side: t.side as PositionSide,
        action: t.action as TradeAction,
        quantity: t.quantity,
        price: t.price,
        notional: t.notional,
        createdAt: new Date(row.created_at as string),
      })),
    };
  });
}

// ============================================================================
// Agent Trades
// ============================================================================

export interface RecordTradeInput {
  decisionId: string;
  agentSessionId: string;
  marketTicker: string;
  marketTitle?: string;
  side: PositionSide;
  action: TradeAction;
  quantity: number;
  price: number;
  notional: number;
  txSignature?: string;
  pnl?: number;
}

/**
 * Record an executed trade to the database
 */
export async function recordAgentTrade(
  input: RecordTradeInput
): Promise<AgentTrade> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const insertData: DbAgentTradeInsert = {
    decision_id: input.decisionId,
    agent_session_id: input.agentSessionId,
    market_ticker: input.marketTicker,
    market_title: input.marketTitle ?? null,
    side: input.side,
    action: input.action,
    quantity: input.quantity,
    price: input.price,
    notional: input.notional,
    tx_signature: input.txSignature ?? null,
    pnl: input.pnl ?? null,
  };

  const { data, error } = await client
    .from("agent_trades")
    .insert(insertData as never)
    .select()
    .single();

  if (error || !data) {
    console.error("[agents] Failed to record trade:", error);
    throw error ?? new Error("Failed to record trade");
  }

  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    decisionId: row.decision_id as string,
    agentSessionId: row.agent_session_id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: (row.market_title as string) ?? undefined,
    side: row.side as PositionSide,
    action: row.action as TradeAction,
    quantity: row.quantity as number,
    price: row.price as number,
    notional: row.notional as number,
    txSignature: (row.tx_signature as string) ?? undefined,
    pnl: (row.pnl as number) ?? undefined,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Get trades for a trading session
 */
export async function getAgentTrades(
  sessionId: string,
  limit = 100
): Promise<AgentTrade[]> {
  const client = createServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("agent_trades")
    .select(
      `
      *,
      agent_sessions!inner(session_id)
    `
    )
    .eq("agent_sessions.session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[agents] Failed to fetch trades:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    decisionId: row.decision_id as string,
    agentSessionId: row.agent_session_id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: (row.market_title as string) ?? undefined,
    side: row.side as PositionSide,
    action: row.action as TradeAction,
    quantity: row.quantity as number,
    price: row.price as number,
    notional: row.notional as number,
    txSignature: (row.tx_signature as string) ?? undefined,
    pnl: (row.pnl as number) ?? undefined,
    createdAt: new Date(row.created_at as string),
  }));
}

// ============================================================================
// Chart Data
// ============================================================================

/**
 * Get chart data for performance visualization
 */
export async function getChartData(
  sessionId: string,
  hoursBack = 24
): Promise<
  Array<{
    timestamp: string;
    modelName: string;
    portfolioValue: number;
  }>
> {
  const client = createServerClient();
  if (!client) return [];

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("agent_decisions")
    .select(
      `
      created_at,
      portfolio_value_after,
      agent_sessions!inner(session_id, model_name)
    `
    )
    .eq("agent_sessions.session_id", sessionId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[agents] Failed to fetch chart data:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => {
    const agentSessions = row.agent_sessions as { model_name: string };
    return {
      timestamp: row.created_at as string,
      modelName: agentSessions.model_name,
      portfolioValue: row.portfolio_value_after as number,
    };
  });
}
