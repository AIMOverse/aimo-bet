/**
 * Transform functions to convert agent_decisions to ChatMessage format
 * for the existing chat UI components.
 */

import type {
  ChatMessage,
  ChatMetadata,
  AgentDecision,
  AgentTrade,
  DecisionType,
} from "./types";

/**
 * Transform an agent decision into a ChatMessage for the existing chat UI
 */
export function decisionToChatMessage(
  decision: AgentDecision,
  agentSession: { sessionId: string; modelId: string; modelName: string },
  trades: AgentTrade[] = []
): ChatMessage {
  const content = formatDecisionContent(decision, trades);

  return {
    id: decision.id,
    role: "assistant",
    parts: [{ type: "text", text: content }],
    metadata: {
      sessionId: agentSession.sessionId,
      authorType: "model",
      authorId: agentSession.modelId,
      messageType:
        decision.decision === "buy" || decision.decision === "sell"
          ? "trade"
          : "analysis",
      createdAt: decision.createdAt.getTime(),
      // Extended metadata for decisions
      decision: decision.decision,
      confidence: decision.confidence,
      marketTicker: decision.marketTicker,
      portfolioValue: decision.portfolioValueAfter,
      triggerType: decision.triggerType,
    } as ChatMetadata,
  };
}

/**
 * Format decision + trades into readable message content
 */
function formatDecisionContent(
  decision: AgentDecision,
  trades: AgentTrade[]
): string {
  const parts: string[] = [];

  // Decision header
  const decisionEmoji: Record<DecisionType, string> = {
    buy: "📈",
    sell: "📉",
    hold: "⏸️",
    skip: "⏭️",
  };

  parts.push(`${decisionEmoji[decision.decision]} **${decision.decision.toUpperCase()}**`);

  // Market info
  if (decision.marketTicker) {
    parts.push(`Market: ${decision.marketTitle || decision.marketTicker}`);
  }

  // Confidence
  if (decision.confidence) {
    parts.push(`Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
  }

  // Reasoning (main content)
  parts.push("");
  parts.push(decision.reasoning);

  // Trades
  if (trades.length > 0) {
    parts.push("");
    parts.push("**Trades:**");
    for (const trade of trades) {
      const action = trade.action === "buy" ? "Bought" : "Sold";
      parts.push(
        `→ ${action} ${trade.quantity} ${trade.side.toUpperCase()} @ $${trade.price.toFixed(2)} ($${trade.notional.toFixed(2)})`
      );
    }
  }

  // Portfolio value
  parts.push("");
  parts.push(`Portfolio: $${decision.portfolioValueAfter.toLocaleString()}`);

  return parts.join("\n");
}

/**
 * Database row type for decisions with joined data
 */
interface DbDecisionWithJoins {
  id: string;
  agent_session_id: string;
  trigger_type: string;
  trigger_details: Record<string, unknown> | null;
  market_ticker: string | null;
  market_title: string | null;
  decision: string;
  reasoning: string;
  confidence: number | null;
  market_context: Record<string, unknown> | null;
  portfolio_value_after: number;
  created_at: string;
  agent_sessions: {
    session_id: string;
    model_id: string;
    model_name: string;
  };
  agent_trades: Array<{
    id: string;
    side: "yes" | "no";
    action: "buy" | "sell";
    quantity: number;
    price: number;
    notional: number;
  }>;
}

/**
 * Transform database rows to ChatMessage array (for initial load)
 */
export function decisionsToMessages(
  decisions: DbDecisionWithJoins[]
): ChatMessage[] {
  return decisions.map((d) => {
    const decision: AgentDecision = {
      id: d.id,
      agentSessionId: d.agent_session_id,
      triggerType: d.trigger_type as AgentDecision["triggerType"],
      triggerDetails: d.trigger_details ?? undefined,
      marketTicker: d.market_ticker ?? undefined,
      marketTitle: d.market_title ?? undefined,
      decision: d.decision as AgentDecision["decision"],
      reasoning: d.reasoning,
      confidence: d.confidence ?? undefined,
      marketContext: d.market_context ?? undefined,
      portfolioValueAfter: d.portfolio_value_after,
      createdAt: new Date(d.created_at),
    };

    const trades: AgentTrade[] = (d.agent_trades || []).map((t) => ({
      id: t.id,
      decisionId: d.id,
      agentSessionId: d.agent_session_id,
      marketTicker: d.market_ticker || "",
      side: t.side,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      notional: t.notional,
      createdAt: new Date(d.created_at),
    }));

    return decisionToChatMessage(
      decision,
      {
        sessionId: d.agent_sessions.session_id,
        modelId: d.agent_sessions.model_id,
        modelName: d.agent_sessions.model_name,
      },
      trades
    );
  });
}

/**
 * Map a single database row to AgentDecision
 */
export function mapDbToAgentDecision(
  row: Record<string, unknown>
): AgentDecision {
  return {
    id: row.id as string,
    agentSessionId: row.agent_session_id as string,
    triggerType: row.trigger_type as AgentDecision["triggerType"],
    triggerDetails: (row.trigger_details as Record<string, unknown>) ?? undefined,
    marketTicker: (row.market_ticker as string) ?? undefined,
    marketTitle: (row.market_title as string) ?? undefined,
    decision: row.decision as AgentDecision["decision"],
    reasoning: row.reasoning as string,
    confidence: (row.confidence as number) ?? undefined,
    marketContext: (row.market_context as Record<string, unknown>) ?? undefined,
    portfolioValueAfter: row.portfolio_value_after as number,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Map a single database row to AgentTrade
 */
export function mapDbToAgentTrade(row: Record<string, unknown>): AgentTrade {
  return {
    id: row.id as string,
    decisionId: row.decision_id as string,
    agentSessionId: row.agent_session_id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: (row.market_title as string) ?? undefined,
    side: row.side as AgentTrade["side"],
    action: row.action as AgentTrade["action"],
    quantity: row.quantity as number,
    price: row.price as number,
    notional: row.notional as number,
    txSignature: (row.tx_signature as string) ?? undefined,
    pnl: (row.pnl as number) ?? undefined,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Map a single database row to AgentSession
 */
export function mapDbToAgentSession(
  row: Record<string, unknown>
): {
  id: string;
  sessionId: string;
  modelId: string;
  modelName: string;
  walletAddress: string;
  startingCapital: number;
  currentValue: number;
  totalPnl: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    modelId: row.model_id as string,
    modelName: row.model_name as string,
    walletAddress: row.wallet_address as string,
    startingCapital: row.starting_capital as number,
    currentValue: row.current_value as number,
    totalPnl: row.total_pnl as number,
    status: row.status as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
