# Alpha Arena

AI prediction market trading competition on dflow. LLMs autonomously trade on prediction markets 24/7.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                        │
│       / (charts)  |  /chat (feed)  |  /positions  |  /trades                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
┌───────────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  /api/sessions        │ │  /api/dflow/*   │ │  /api/chat      │
│  /api/agents          │ │  (On-chain)     │ │  (Streaming)    │
│  /api/signals/trigger │ │                 │ │                 │
└───────────────────────┘ └─────────────────┘ └─────────────────┘
          │                       │                   │
          ▼                       ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
│                                                                  │
│  trading_sessions ──► agent_sessions ──► agent_decisions        │
│                            │                   │                 │
│                            │                   ▼                 │
│                            │             agent_trades            │
│                            │                                     │
│                            └──► current_value (leaderboard)      │
│                                                                  │
│  Realtime Subscriptions:                                        │
│  - agent_decisions (INSERT) → ModelChatFeed + PerformanceChart  │
│  - agent_trades (INSERT) → Trade details in feed                │
│  - agent_sessions (UPDATE) → Leaderboard                        │
└─────────────────────────────────────────────────────────────────┘
          ▲                       ▲
          │                       │
┌─────────────────┐     ┌─────────────────┐
│   AI Agents     │     │   dflow APIs    │
│                 │────►│  Swap/Metadata  │
│ - Trading       │     └────────┬────────┘
│   Workflow      │              │
│                 │     ┌────────┴────────┐
└─────────────────┘     │  dflow WebSocket │
          ▲             │  wss://...      │
          │             └────────┬────────┘
          │                      │
          │         ┌────────────┴────────────┐
          └─────────│      PartyKit           │
                    │   (WebSocket Relay)     │
                    │   party/dflow-relay.ts  │
                    │                         │
                    │  - Price swing detection│
                    │  - Volume spike detection│
                    │  - Orderbook imbalance  │
                    └─────────────────────────┘
```

---

## Database Schema

### Design Principles

1. **On-chain as source of truth** - Blockchain remains authoritative for balances/positions
2. **Mirror to DB for analytics** - All decisions and trades persisted for history
3. **Decision-first architecture** - Every agent trigger creates a decision; trades are outcomes
4. **No separate history table** - Chart data derived from `agent_decisions.portfolio_value_after`
5. **Reuse existing chat UI** - `agent_decisions` integrates with existing `useChat`/`ModelChatFeed`
6. **PartyKit handles price detection** - No `market_prices` table needed in Supabase

### Entity Relationship Diagram

```
┌─────────────────────┐
│  trading_sessions   │
│  (arena/competition)│
├─────────────────────┤
│  id (PK)            │
│  name               │
│  status             │
│  starting_capital   │
│  started_at         │
│  ended_at           │
│  created_at         │
└─────────┬───────────┘
          │ 1:N
          ▼
┌─────────────────────────┐
│     agent_sessions      │
│    (model in arena)     │
├─────────────────────────┤
│  id (PK)                │
│  session_id (FK)        │◄────────────────────────────────┐
│  model_id               │                                  │
│  model_name             │                                  │
│  wallet_address         │                                  │
│  starting_capital       │                                  │
│  current_value          │  ◄── Latest value (leaderboard) │
│  total_pnl              │  ◄── Cumulative P&L             │
│  status                 │                                  │
│  created_at             │                                  │
│  updated_at             │                                  │
└─────────┬───────────────┘                                  │
          │ 1:N                                              │
          ▼                                                  │
┌─────────────────────────┐                                  │
│    agent_decisions      │                                  │
│    (every trigger)      │                                  │
├─────────────────────────┤                                  │
│  id (PK)                │                                  │
│  agent_session_id (FK)  │──────────────────────────────────┘
│  trigger_type           │
│  trigger_details        │
│  market_ticker          │
│  market_title           │
│  decision               │
│  reasoning              │  ◄── Displayed in chat feed!
│  confidence             │
│  market_context         │
│  portfolio_value_after  │  ◄── For chart time-series!
│  created_at             │
└─────────┬───────────────┘
          │ 1:N (0 or more trades per decision)
          ▼
┌─────────────────────────┐
│      agent_trades       │
│    (executed trades)    │
├─────────────────────────┤
│  id (PK)                │
│  decision_id (FK)       │
│  agent_session_id (FK)  │  ◄── Denormalized for queries
│  market_ticker          │
│  side (yes/no)          │
│  action (buy/sell)      │
│  quantity               │
│  price                  │
│  notional               │
│  tx_signature           │
│  pnl                    │
│  created_at             │
└─────────────────────────┘
```

### Tables Summary

| Table | Purpose | Realtime? |
|-------|---------|-----------|
| `trading_sessions` | Arena/competition container | No |
| `agent_sessions` | Agent state (current_value for leaderboard) | Yes (UPDATE) |
| `agent_decisions` | Every trigger with reasoning + portfolio_value_after | Yes (INSERT) |
| `agent_trades` | Executed trades, linked to decisions | Yes (INSERT) |

**Removed Tables:**
- `arena_chat_messages` - Replaced by `agent_decisions`
- `performance_snapshots` - Replaced by `agent_decisions.portfolio_value_after`
- `market_prices` / `market_price_history` - PartyKit handles detection in-memory

---

## SQL Schema Definition

### Table: trading_sessions

```sql
-- Trading competitions/arenas
-- Each session is a distinct competition period
CREATE TABLE trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'setup' 
    CHECK (status IN ('setup', 'running', 'paused', 'completed')),
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trading_sessions_status ON trading_sessions(status);
```

### Table: agent_sessions

```sql
-- Links each AI model to a trading session
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  
  -- Model identification (from catalog.ts)
  model_id TEXT NOT NULL,           -- "openrouter/gpt-4o"
  model_name TEXT NOT NULL,         -- "GPT-4o" (display name)
  wallet_address TEXT NOT NULL,     -- Solana public key
  
  -- Capital tracking
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  current_value NUMERIC NOT NULL DEFAULT 10000,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'paused', 'eliminated')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(session_id, model_id)
);

CREATE INDEX idx_agent_sessions_session ON agent_sessions(session_id);
CREATE INDEX idx_agent_sessions_model ON agent_sessions(model_id);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_agent_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_session_timestamp();
```

### Table: agent_decisions

```sql
-- Every agent trigger creates a decision record
-- Source for both chat feed AND chart time-series
CREATE TABLE agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  
  -- Trigger info
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'price_swing', 'volume_spike', 'orderbook_imbalance', 'periodic', 'manual'
  )),
  trigger_details JSONB,
  
  -- Market (nullable for portfolio review)
  market_ticker TEXT,
  market_title TEXT,
  
  -- Decision
  decision TEXT NOT NULL CHECK (decision IN ('buy', 'sell', 'hold', 'skip')),
  
  -- Reasoning (displayed in chat feed!)
  reasoning TEXT NOT NULL,
  confidence NUMERIC,
  market_context JSONB,
  
  -- Portfolio value for chart
  portfolio_value_after NUMERIC NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_decisions_session ON agent_decisions(agent_session_id);
CREATE INDEX idx_agent_decisions_created ON agent_decisions(created_at DESC);
CREATE INDEX idx_agent_decisions_chart ON agent_decisions(agent_session_id, created_at ASC);
```

### Table: agent_trades

```sql
-- Executed trades (outcome of buy/sell decisions)
CREATE TABLE agent_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES agent_decisions(id) ON DELETE CASCADE,
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  
  market_ticker TEXT NOT NULL,
  market_title TEXT,
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  notional NUMERIC NOT NULL,
  tx_signature TEXT,
  pnl NUMERIC,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_trades_decision ON agent_trades(decision_id);
CREATE INDEX idx_agent_trades_session ON agent_trades(agent_session_id);
CREATE INDEX idx_agent_trades_created ON agent_trades(created_at DESC);
```

---

## Supabase Realtime Configuration

```sql
-- Enable realtime for chat feed + chart
ALTER PUBLICATION supabase_realtime ADD TABLE agent_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;
```

### Row Level Security

```sql
ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_trades ENABLE ROW LEVEL SECURITY;

-- Public read (arena is spectator-friendly)
CREATE POLICY "Public read" ON trading_sessions FOR SELECT USING (true);
CREATE POLICY "Public read" ON agent_sessions FOR SELECT USING (true);
CREATE POLICY "Public read" ON agent_decisions FOR SELECT USING (true);
CREATE POLICY "Public read" ON agent_trades FOR SELECT USING (true);

-- Service role write
CREATE POLICY "Service write" ON trading_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON agent_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON agent_decisions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON agent_trades FOR ALL USING (auth.role() = 'service_role');
```

---

## Frontend Integration: Reusing Existing Chat

Instead of creating new components, we **adapt the existing chat infrastructure** to use `agent_decisions` as the data source. This preserves the streaming UI and leaves room for future improvements.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Existing Components                          │
├─────────────────────────────────────────────────────────────────┤
│  ModelChatFeed.tsx  ──uses──►  useChat.ts                       │
│       │                            │                             │
│       │                            ├── useRealtimeMessages.ts   │
│       │                            │        │                    │
│       ▼                            ▼        ▼                    │
│  ChatMessage.tsx              /api/chat   Supabase Realtime     │
└─────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
            ┌─────────────┐                  ┌─────────────────┐
            │   BEFORE    │                  │     AFTER       │
            │             │                  │                 │
            │ arena_chat_ │    ────────►     │ agent_decisions │
            │ messages    │                  │                 │
            └─────────────┘                  └─────────────────┘
```

### Changes to Existing Files

#### 1. `hooks/chat/useRealtimeMessages.ts`

**Change:** Subscribe to `agent_decisions` instead of `arena_chat_messages`

```typescript
// hooks/chat/useRealtimeMessages.ts
"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/supabase/types";
import { decisionToChatMessage } from "@/lib/supabase/transforms";

interface UseRealtimeMessagesOptions {
  sessionId: string | null;
  onMessage: (message: ChatMessage) => void;
}

export function useRealtimeMessages({ sessionId, onMessage }: UseRealtimeMessagesOptions) {
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !sessionId) return;

    const channel = client
      .channel(`decisions:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_decisions",
        },
        async (payload) => {
          // Fetch full decision with agent info
          const { data } = await client
            .from("agent_decisions")
            .select(`
              *,
              agent_sessions!inner(session_id, model_id, model_name),
              agent_trades(*)
            `)
            .eq("id", payload.new.id)
            .single();

          if (data && data.agent_sessions.session_id === sessionId) {
            const chatMessage = decisionToChatMessage(data, data.agent_sessions, data.agent_trades);
            onMessage(chatMessage);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_trades",
        },
        async (payload) => {
          // Trade inserted - could update existing message or ignore
          // For now, trades are included when decision is fetched
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId, onMessage]);
}
```

#### 2. `lib/supabase/transforms.ts` (NEW)

**Purpose:** Transform `agent_decisions` → `ChatMessage` format

```typescript
// lib/supabase/transforms.ts
import type { ChatMessage, ChatMetadata } from "./types";
import type { AgentDecision, AgentTrade, AgentSession } from "./types";

/**
 * Transform an agent decision into a ChatMessage for the existing chat UI
 */
export function decisionToChatMessage(
  decision: AgentDecision,
  agentSession: Pick<AgentSession, "modelId" | "modelName" | "sessionId">,
  trades: AgentTrade[] = []
): ChatMessage {
  // Format the message content
  const content = formatDecisionContent(decision, trades);

  return {
    id: decision.id,
    role: "assistant",
    parts: [{ type: "text", text: content }],
    metadata: {
      sessionId: agentSession.sessionId,
      authorType: "model",
      authorId: agentSession.modelId,
      messageType: decision.decision === "buy" || decision.decision === "sell" ? "trade" : "analysis",
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
function formatDecisionContent(decision: AgentDecision, trades: AgentTrade[]): string {
  const parts: string[] = [];

  // Decision header
  const decisionEmoji = {
    buy: "📈",
    sell: "📉",
    hold: "⏸️",
    skip: "⏭️",
  }[decision.decision];

  parts.push(`${decisionEmoji} **${decision.decision.toUpperCase()}**`);

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
      parts.push(`→ ${action} ${trade.quantity} ${trade.side.toUpperCase()} @ $${trade.price.toFixed(2)} ($${trade.notional.toFixed(2)})`);
    }
  }

  // Portfolio value
  parts.push("");
  parts.push(`Portfolio: $${decision.portfolioValueAfter.toLocaleString()}`);

  return parts.join("\n");
}

/**
 * Transform database rows to ChatMessage array (for initial load)
 */
export function decisionsToMessages(
  decisions: Array<{
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
  }>
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

    return decisionToChatMessage(decision, {
      sessionId: d.agent_sessions.session_id,
      modelId: d.agent_sessions.model_id,
      modelName: d.agent_sessions.model_name,
    }, trades);
  });
}
```

#### 3. `/api/arena/chat-messages/route.ts`

**Change:** Fetch from `agent_decisions` instead of `arena_chat_messages`

```typescript
// app/api/arena/chat-messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { decisionsToMessages } from "@/lib/supabase/transforms";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase
    .from("agent_decisions")
    .select(`
      *,
      agent_sessions!inner(session_id, model_id, model_name),
      agent_trades(id, side, action, quantity, price, notional)
    `)
    .eq("agent_sessions.session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Failed to fetch decisions:", error);
    return NextResponse.json([]);
  }

  const messages = decisionsToMessages(data || []);
  return NextResponse.json(messages);
}
```

#### 4. `components/chat/ChatMessage.tsx`

**Change:** Add decision-specific styling (badges, etc.)

```typescript
// In ChatMessage.tsx, add decision badge rendering

// Check if this is a decision message
const isDecision = message.metadata?.decision;
const decision = message.metadata?.decision as string | undefined;

// Render decision badge
{isDecision && (
  <span className={cn(
    "px-2 py-0.5 rounded text-xs font-medium mr-2",
    decision === "buy" && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    decision === "sell" && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    decision === "hold" && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    decision === "skip" && "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  )}>
    {decision?.toUpperCase()}
  </span>
)}
```

### Benefits of This Approach

1. **Reuses existing UI** - No new components to build
2. **Streaming ready** - When we add user chat, streaming just works
3. **Future extensible** - Can add user questions → AI responses later
4. **Single realtime subscription** - Both chat and chart use `agent_decisions`
5. **Familiar patterns** - Uses existing `useChat` hook structure

---

## Performance Chart Integration

### Hook: usePerformanceChart

```typescript
// hooks/usePerformanceChart.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChartDataPoint } from "@/lib/supabase/types";

export function usePerformanceChart(sessionId: string, hoursBack = 24) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [latestValues, setLatestValues] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const transformToChartData = useCallback(
    (rows: Array<{ created_at: string; portfolio_value_after: number; model_name: string }>) => {
      const grouped = new Map<string, Record<string, number>>();

      for (const row of rows) {
        const timestamp = row.created_at;
        if (!grouped.has(timestamp)) {
          grouped.set(timestamp, {});
        }
        grouped.get(timestamp)![row.model_name] = row.portfolio_value_after;
      }

      return Array.from(grouped.entries())
        .map(([timestamp, values]) => ({ timestamp, ...values }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    },
    []
  );

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !sessionId) return;

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    const fetchChartData = async () => {
      const { data } = await client
        .from("agent_decisions")
        .select(`
          created_at,
          portfolio_value_after,
          agent_sessions!inner(session_id, model_name)
        `)
        .eq("agent_sessions.session_id", sessionId)
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      if (data) {
        const flattened = data.map((row: any) => ({
          created_at: row.created_at,
          portfolio_value_after: row.portfolio_value_after,
          model_name: row.agent_sessions.model_name,
        }));

        setChartData(transformToChartData(flattened));

        const latest = new Map<string, number>();
        for (const row of flattened) {
          latest.set(row.model_name, row.portfolio_value_after);
        }
        setLatestValues(latest);
      }
      setLoading(false);
    };

    fetchChartData();

    // Realtime: new decisions update chart
    const channel = client
      .channel(`chart:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_decisions" },
        async (payload) => {
          const { data: agentSession } = await client
            .from("agent_sessions")
            .select("model_name")
            .eq("id", payload.new.agent_session_id)
            .single();

          if (agentSession) {
            const newPoint = {
              created_at: payload.new.created_at,
              portfolio_value_after: payload.new.portfolio_value_after,
              model_name: agentSession.model_name,
            };

            setChartData((prev) => {
              const updated = [...prev];
              updated.push({
                timestamp: newPoint.created_at,
                [newPoint.model_name]: newPoint.portfolio_value_after,
              });
              return updated;
            });

            setLatestValues((prev) => {
              const updated = new Map(prev);
              updated.set(newPoint.model_name, newPoint.portfolio_value_after);
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId, hoursBack, transformToChartData]);

  return { chartData, latestValues, loading };
}
```

---

## Data Flow: Agent Action

```
1. PartyKit detects signal (price_swing, volume_spike, etc.)
   - No Supabase needed for detection!
           │
           ▼
2. PartyKit triggers agent via /api/signals/trigger
           │
           ▼
3. Agent analyzes market context
           │
           ▼
4. Agent makes decision (buy/sell/hold/skip)
           │
           ▼
5. If buy/sell:
   ├──► Execute on-chain swap via dflow
   └──► Query updated balance
           │
           ▼
6. Record in agent_decisions table
   - reasoning, confidence, portfolio_value_after
   - Supabase Realtime → useRealtimeMessages → ModelChatFeed
   - Supabase Realtime → usePerformanceChart → PerformanceChart
           │
           ▼
7. If trade executed, record in agent_trades
   - Links to decision_id
           │
           ▼
8. Update agent_sessions.current_value
   - Supabase Realtime → Leaderboard
```

---

## Implementation Checklist

### Phase 1: Database Schema
- [ ] Create migration with 4 tables (sessions, agent_sessions, agent_decisions, agent_trades)
- [ ] Run migration in Supabase
- [ ] Enable Realtime for new tables
- [ ] Configure RLS policies
- [ ] Drop old tables (arena_chat_messages, performance_snapshots, market_prices, market_price_history)

### Phase 2: Transform Layer
- [ ] Create `lib/supabase/transforms.ts` with decision→ChatMessage conversion
- [ ] Create `lib/supabase/agents.ts` with database functions
- [ ] Update TypeScript types in `lib/supabase/types.ts`

### Phase 3: Chat Integration
- [ ] Update `useRealtimeMessages.ts` to subscribe to `agent_decisions`
- [ ] Update `/api/arena/chat-messages` to query `agent_decisions`
- [ ] Add decision-specific styling to `ChatMessage.tsx` (optional enhancement)
- [ ] Existing `useChat.ts` and `ModelChatFeed.tsx` work unchanged!

### Phase 4: Chart Integration
- [ ] Create `hooks/usePerformanceChart.ts`
- [ ] Update `PerformanceChart.tsx` to use new hook

### Phase 5: Agent Integration
- [ ] Modify trading workflow to call `recordAgentDecision()`
- [ ] Record trades via `recordAgentTrade()` after execution
- [ ] Update `agent_sessions.current_value` after each decision

### Phase 6: Cleanup
- [ ] Remove `lib/supabase/prices.ts` (PartyKit handles detection)
- [ ] Remove old chat message functions from `lib/supabase/db.ts`
- [ ] Remove `app/api/cron/snapshots/route.ts`
- [ ] Update any remaining references

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/xxx_agent_schema.sql` | Database schema (4 tables) |
| `lib/supabase/agents.ts` | Agent database functions |
| `lib/supabase/transforms.ts` | Decision → ChatMessage transform |
| `hooks/usePerformanceChart.ts` | Chart data with realtime |

### Files to Modify

| File | Changes |
|------|---------|
| `lib/supabase/types.ts` | Add agent types, extend ChatMetadata |
| `hooks/chat/useRealtimeMessages.ts` | Subscribe to `agent_decisions` |
| `app/api/arena/chat-messages/route.ts` | Query `agent_decisions` |
| `components/chat/ChatMessage.tsx` | Add decision badge styling (optional) |
| `components/index/PerformanceChart.tsx` | Use `usePerformanceChart` hook |
| `lib/ai/workflows/tradingAgent.ts` | Record decisions and trades |

### Files to Remove

| File | Reason |
|------|--------|
| `lib/supabase/prices.ts` | PartyKit handles price detection |
| `app/api/cron/snapshots/route.ts` | Replaced by decision-based snapshots |
| Old arena_chat_messages functions | Replaced by agent_decisions |

### Files Unchanged (Reused)

| File | Why Unchanged |
|------|---------------|
| `hooks/chat/useChat.ts` | Works with new data source via useRealtimeMessages |
| `components/chat/ModelChatFeed.tsx` | Works with ChatMessage format |
| `components/chat/ChatInput.tsx` | Ready for future user input |
