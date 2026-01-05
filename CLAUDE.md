# Supabase as Single Source of Truth for Agent Data

Refactor the agent data architecture so all UI hooks read from Supabase tables, with the trading workflow as the single writer.

---

## Overview

**Current state:** Hooks fetch from mixed sources (dflow API, RPC, Supabase)
**Target state:** All hooks read from Supabase; workflow writes all agent data

| Hook | Current Source | Target Source |
|------|----------------|---------------|
| `useChat` | Supabase `agent_decisions` | ✅ Already correct |
| `useTrades` | dflow Metadata API | → Supabase `agent_trades` |
| `usePositions` | RPC + dflow API | → Supabase `agent_positions` (new) |

**Note:** The agent's `retrievePosition` tool continues to use dflow API (on-chain truth) for trading decisions. Supabase is for UI display, not agent decision-making.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Trading Workflow                             │
│  (Single writer for all agent data)                              │
│                                                                   │
│  1. Get session + agent session                                  │
│  2. Get USDC balance (single RPC call)                           │
│  3. Run AI agent (tools use dflow API for on-chain data)         │
│  4. Record all results atomically:                               │
│     → agent_decisions                                            │
│     → agent_trades                                               │
│     → agent_positions (upsert)                                   │
│     → agent_sessions (update value)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase Tables                              │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ agent_decisions │  │  agent_trades   │  │ agent_positions │  │
│  │                 │  │                 │  │     (NEW)       │  │
│  │ → useChat       │  │ → useTrades     │  │ → usePositions  │  │
│  │   (realtime)    │  │   (realtime)    │  │   (realtime)    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                   │
│  ┌─────────────────┐                                             │
│  │ agent_sessions  │  (portfolio value, P&L for leaderboard)    │
│  └─────────────────┘                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 UI Hooks (Direct Supabase + Realtime)            │
│                                                                   │
│  useChat        → Supabase client + realtime subscription       │
│  useTrades      → Supabase client + realtime subscription       │
│  usePositions   → Supabase client + realtime subscription       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Changes

### New Table: `agent_positions`

```sql
CREATE TABLE agent_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  market_ticker TEXT NOT NULL,
  market_title TEXT,
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  mint TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  avg_entry_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(agent_session_id, market_ticker, side)
);

-- Index for fast lookups
CREATE INDEX idx_agent_positions_session ON agent_positions(agent_session_id);

-- Enable realtime
ALTER TABLE agent_positions REPLICA IDENTITY FULL;
```

### Update `agent_trades` Table

Add `action` type for redemptions:

```sql
-- Ensure action column supports 'redeem'
ALTER TABLE agent_trades 
  DROP CONSTRAINT IF EXISTS agent_trades_action_check,
  ADD CONSTRAINT agent_trades_action_check 
    CHECK (action IN ('buy', 'sell', 'redeem'));
```

**Database function for atomic position upsert:**

```sql
CREATE OR REPLACE FUNCTION upsert_agent_position(
  p_agent_session_id UUID,
  p_market_ticker TEXT,
  p_market_title TEXT,
  p_side TEXT,
  p_mint TEXT,
  p_quantity_delta NUMERIC
) RETURNS VOID AS $$
BEGIN
  INSERT INTO agent_positions (
    agent_session_id, market_ticker, market_title, side, mint, quantity
  ) VALUES (
    p_agent_session_id, p_market_ticker, p_market_title, p_side, p_mint, p_quantity_delta
  )
  ON CONFLICT (agent_session_id, market_ticker, side)
  DO UPDATE SET
    quantity = agent_positions.quantity + p_quantity_delta,
    market_title = COALESCE(p_market_title, agent_positions.market_title),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
```

---

## Files to Modify

### 1. `lib/supabase/types.ts` - Add Position Types

```typescript
// Add to existing types
export type TradeAction = "buy" | "sell" | "redeem";

export interface AgentPosition {
  id: string;
  agentSessionId: string;
  marketTicker: string;
  marketTitle?: string;
  side: PositionSide;
  mint: string;
  quantity: number;
  avgEntryPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAgentPositionInsert {
  agent_session_id: string;
  market_ticker: string;
  market_title?: string | null;
  side: PositionSide;
  mint: string;
  quantity: number;
  avg_entry_price?: number | null;
}
```

---

### 2. `lib/supabase/agents.ts` - Add Position Functions

```typescript
// ============================================================================
// Agent Positions
// ============================================================================

export interface UpsertPositionInput {
  agentSessionId: string;
  marketTicker: string;
  marketTitle?: string;
  side: PositionSide;
  mint: string;
  quantityDelta: number;  // Positive for buy, negative for sell
  price?: number;         // For avg price calculation
}

/**
 * Upsert an agent position (delta-based update)
 * Creates position if doesn't exist, updates quantity if exists
 */
export async function upsertAgentPosition(
  input: UpsertPositionInput,
): Promise<void> {
  const client = createServerClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client.rpc('upsert_agent_position', {
    p_agent_session_id: input.agentSessionId,
    p_market_ticker: input.marketTicker,
    p_market_title: input.marketTitle || null,
    p_side: input.side,
    p_mint: input.mint,
    p_quantity_delta: input.quantityDelta,
  });

  if (error) {
    console.error("[agents] Failed to upsert position:", error);
    throw error;
  }
}

/**
 * Get all positions for an agent session
 */
export async function getAgentPositions(
  agentSessionId: string,
): Promise<AgentPosition[]> {
  const client = createServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("agent_positions")
    .select("*")
    .eq("agent_session_id", agentSessionId)
    .gt("quantity", 0)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[agents] Failed to fetch positions:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    agentSessionId: row.agent_session_id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: (row.market_title as string) ?? undefined,
    side: row.side as PositionSide,
    mint: row.mint as string,
    quantity: row.quantity as number,
    avgEntryPrice: (row.avg_entry_price as number) ?? undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }));
}
```

---

### 3. `lib/ai/workflows/tradingAgent.ts` - Simplified Workflow

```typescript
"use workflow";

import {
  PredictionMarketAgent,
  type TradingResult,
  type MarketSignal,
} from "@/lib/ai/agents";
import { getWalletPrivateKey, getModelName } from "@/lib/ai/models/catalog";
import { getGlobalSession } from "@/lib/supabase/db";
import {
  getOrCreateAgentSession,
  recordAgentDecision,
  recordAgentTrade,
  upsertAgentPosition,
  updateAgentSessionValue,
} from "@/lib/supabase/agents";
import type { AgentSession, TriggerType } from "@/lib/supabase/types";
import { getCurrencyBalance } from "@/lib/solana/client";

// ============================================================================
// Types
// ============================================================================

export interface TradingInput {
  modelId: string;
  walletAddress: string;
  signal?: MarketSignal;
  testMode?: boolean;
}

export type { TradingResult, MarketSignal };

// ============================================================================
// Trading Agent Workflow (Durable)
// ============================================================================

export async function tradingAgentWorkflow(
  input: TradingInput,
): Promise<TradingResult> {
  console.log(`[tradingAgent:${input.modelId}] Starting trading workflow`);

  try {
    // Step 1: Get session
    const session = await getSessionStep();

    // Step 2: Get or create agent session
    const agentSession = await getAgentSessionStep(
      session.id,
      input.modelId,
      input.walletAddress,
    );

    // Step 3: Get USDC balance (single RPC call - needed for trading budget)
    const usdcBalance = await getUsdcBalanceStep(input.walletAddress);

    // Step 4: Run AI agent
    // Agent's retrievePosition tool uses dflow API (on-chain truth)
    const result = await runAgentStep(input, usdcBalance);

    // Step 5: Record all results atomically
    // (decision + trades + positions + session value)
    await recordResultsStep(agentSession, input, result, usdcBalance);

    console.log(
      `[tradingAgent:${input.modelId}] Completed: ${result.decision}, ${result.trades.length} trades`,
    );

    return result;
  } catch (error) {
    console.error(`[tradingAgent:${input.modelId}] Error:`, error);
    throw error;
  }
}

// ============================================================================
// Durable Step Functions
// ============================================================================

async function getSessionStep() {
  "use step";
  return await getGlobalSession();
}

async function getAgentSessionStep(
  sessionId: string,
  modelId: string,
  walletAddress: string,
): Promise<AgentSession> {
  "use step";
  const modelName = getModelName(modelId) || modelId;
  return await getOrCreateAgentSession(
    sessionId,
    modelId,
    modelName,
    walletAddress,
  );
}

/**
 * Get USDC balance only (single RPC call).
 */
async function getUsdcBalanceStep(walletAddress: string): Promise<number> {
  "use step";
  try {
    return await getCurrencyBalance(walletAddress, "USDC");
  } catch (error) {
    console.error("[tradingAgent] Failed to fetch USDC balance:", error);
    return 0;
  }
}

/**
 * Run the PredictionMarketAgent.
 * Agent tools use dflow API for on-chain data (not Supabase).
 */
async function runAgentStep(
  input: TradingInput,
  usdcBalance: number,
): Promise<TradingResult> {
  "use step";

  const agent = new PredictionMarketAgent({
    modelId: input.modelId,
    walletAddress: input.walletAddress,
    privateKey: getWalletPrivateKey(input.modelId),
    maxSteps: 10,
  });

  return await agent.run({
    signal: input.signal,
    usdcBalance,
    testMode: input.testMode,
  });
}

/**
 * Record all results to database in one step.
 * Updates: agent_decisions, agent_trades, agent_positions, agent_sessions
 */
async function recordResultsStep(
  agentSession: AgentSession,
  input: TradingInput,
  result: TradingResult,
  usdcBalance: number,
): Promise<void> {
  "use step";

  // Determine trigger type
  let triggerType: TriggerType = "periodic";
  if (input.signal) {
    triggerType = input.signal.type;
  }

  // 1. Record decision
  const decision = await recordAgentDecision({
    agentSessionId: agentSession.id,
    triggerType,
    triggerDetails: input.signal?.data || {},
    marketTicker: result.marketTicker,
    marketTitle: result.marketTitle,
    decision: result.decision,
    reasoning: result.reasoning,
    confidence: result.confidence,
    portfolioValueAfter: result.portfolioValue || usdcBalance,
  });

  console.log(
    `[tradingAgent:${input.modelId}] Recorded decision: ${result.decision} (id: ${decision.id})`,
  );

  // 2. Record trades + update positions
  for (const trade of result.trades) {
    // Record trade
    await recordAgentTrade({
      decisionId: decision.id,
      agentSessionId: agentSession.id,
      marketTicker: trade.marketTicker,
      marketTitle: trade.marketTitle,
      side: trade.side,
      action: trade.action,
      quantity: trade.quantity,
      price: trade.price,
      notional: trade.notional,
      txSignature: trade.id,
    });

    // Update position (delta-based)
    const quantityDelta = trade.action === "buy" 
      ? trade.quantity 
      : -trade.quantity;  // sell or redeem decreases

    await upsertAgentPosition({
      agentSessionId: agentSession.id,
      marketTicker: trade.marketTicker,
      marketTitle: trade.marketTitle,
      side: trade.side,
      mint: trade.mint || "",
      quantityDelta,
      price: trade.price,
    });
  }

  // 3. Update agent session value
  await updateAgentSessionValue(
    agentSession.id,
    result.portfolioValue || usdcBalance,
    (result.portfolioValue || usdcBalance) - agentSession.startingCapital,
  );
}
```

---

### 4. `hooks/trades/useTrades.ts` - Direct Supabase + Realtime

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MODELS } from "@/lib/ai/models";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export interface AgentTrade {
  id: string;
  marketTicker: string;
  marketTitle?: string;
  side: "yes" | "no";
  action: "buy" | "sell" | "redeem";
  quantity: number;
  price: number;
  notional: number;
  txSignature?: string;
  createdAt: Date;
  // Enriched
  modelId?: string;
  modelName?: string;
  modelColor?: string;
}

interface UseTradesOptions {
  sessionId: string;
  modelId?: string;
  limit?: number;
}

// ============================================================================
// Hook
// ============================================================================

export function useTrades({ sessionId, modelId, limit = 50 }: UseTradesOptions) {
  const [trades, setTrades] = useState<AgentTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Load initial trades
  const loadTrades = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !sessionId) return;

    setIsLoading(true);
    try {
      let query = client
        .from("agent_trades")
        .select(`
          *,
          agent_sessions!inner(session_id, model_id, model_name)
        `)
        .eq("agent_sessions.session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (modelId) {
        query = query.eq("agent_sessions.model_id", modelId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setTrades((data || []).map(mapTradeRow));
      setError(undefined);
    } catch (err) {
      console.error("[useTrades] Failed to fetch:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch trades"));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, modelId, limit]);

  // Initial load
  useEffect(() => {
    if (sessionId) loadTrades();
  }, [sessionId, loadTrades]);

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) return;

    console.log(`[useTrades] Subscribing to trades for session: ${sessionId}`);

    const channel = client
      .channel(`trades:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_trades",
        },
        async (payload) => {
          // Fetch full trade with agent info
          const { data } = await client
            .from("agent_trades")
            .select(`
              *,
              agent_sessions!inner(session_id, model_id, model_name)
            `)
            .eq("id", payload.new.id)
            .single();

          if (data) {
            const agentSession = data.agent_sessions as {
              session_id: string;
              model_id: string;
              model_name: string;
            };

            // Only add if matches our session (and optionally model)
            if (agentSession.session_id === sessionId) {
              if (!modelId || agentSession.model_id === modelId) {
                const trade = mapTradeRow(data);
                setTrades((prev) => {
                  // Dedupe
                  if (prev.some((t) => t.id === trade.id)) return prev;
                  return [trade, ...prev].slice(0, limit);
                });
              }
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      console.log(`[useTrades] Unsubscribing from session: ${sessionId}`);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId, modelId, limit]);

  return {
    trades,
    isLoading,
    error,
    mutate: loadTrades,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function mapTradeRow(row: Record<string, unknown>): AgentTrade {
  const agentSession = row.agent_sessions as {
    model_id: string;
    model_name: string;
  };
  const model = MODELS.find((m) => m.id === agentSession.model_id);

  return {
    id: row.id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: (row.market_title as string) ?? undefined,
    side: row.side as "yes" | "no",
    action: row.action as "buy" | "sell" | "redeem",
    quantity: row.quantity as number,
    price: row.price as number,
    notional: row.notional as number,
    txSignature: (row.tx_signature as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
    modelId: agentSession.model_id,
    modelName: model?.name || agentSession.model_name,
    modelColor: model?.chartColor,
  };
}

// ============================================================================
// Session Trades Hook
// ============================================================================

export function useSessionTrades(sessionId: string | null, limit = 50) {
  const result = useTrades({ sessionId: sessionId ?? "", limit });

  if (!sessionId) {
    return {
      trades: [] as AgentTrade[],
      isLoading: false,
      error: undefined,
      mutate: () => Promise.resolve(),
    };
  }

  return result;
}
```

---

### 5. `hooks/positions/usePositions.ts` - Direct Supabase + Realtime

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MODELS } from "@/lib/ai/models";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export interface AgentPosition {
  id: string;
  marketTicker: string;
  marketTitle?: string;
  side: "yes" | "no";
  mint: string;
  quantity: number;
  // Enriched
  modelId?: string;
  modelName?: string;
}

interface UsePositionsOptions {
  sessionId: string;
  modelId?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function usePositions({ sessionId, modelId }: UsePositionsOptions) {
  const [positions, setPositions] = useState<AgentPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Load initial positions
  const loadPositions = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !sessionId) return;

    setIsLoading(true);
    try {
      let query = client
        .from("agent_positions")
        .select(`
          *,
          agent_sessions!inner(session_id, model_id, model_name)
        `)
        .eq("agent_sessions.session_id", sessionId)
        .gt("quantity", 0)
        .order("updated_at", { ascending: false });

      if (modelId) {
        query = query.eq("agent_sessions.model_id", modelId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setPositions((data || []).map(mapPositionRow));
      setError(undefined);
    } catch (err) {
      console.error("[usePositions] Failed to fetch:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch positions"));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, modelId]);

  // Initial load
  useEffect(() => {
    if (sessionId) loadPositions();
  }, [sessionId, loadPositions]);

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return;

    const client = getSupabaseClient();
    if (!client) return;

    console.log(`[usePositions] Subscribing to positions for session: ${sessionId}`);

    const channel = client
      .channel(`positions:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",  // INSERT, UPDATE, DELETE
          schema: "public",
          table: "agent_positions",
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            // Remove deleted position
            const oldId = (payload.old as { id: string }).id;
            setPositions((prev) => prev.filter((p) => p.id !== oldId));
            return;
          }

          // INSERT or UPDATE - fetch full record with agent info
          const { data } = await client
            .from("agent_positions")
            .select(`
              *,
              agent_sessions!inner(session_id, model_id, model_name)
            `)
            .eq("id", payload.new.id)
            .single();

          if (data) {
            const agentSession = data.agent_sessions as {
              session_id: string;
              model_id: string;
              model_name: string;
            };

            // Only process if matches our session (and optionally model)
            if (agentSession.session_id === sessionId) {
              if (!modelId || agentSession.model_id === modelId) {
                const position = mapPositionRow(data);

                setPositions((prev) => {
                  // Remove if quantity is 0
                  if (position.quantity <= 0) {
                    return prev.filter((p) => p.id !== position.id);
                  }

                  // Update existing or add new
                  const exists = prev.some((p) => p.id === position.id);
                  if (exists) {
                    return prev.map((p) => (p.id === position.id ? position : p));
                  }
                  return [position, ...prev];
                });
              }
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      console.log(`[usePositions] Unsubscribing from session: ${sessionId}`);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId, modelId]);

  return {
    positions,
    isLoading,
    error,
    mutate: loadPositions,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function mapPositionRow(row: Record<string, unknown>): AgentPosition {
  const agentSession = row.agent_sessions as {
    model_id: string;
    model_name: string;
  };
  const model = MODELS.find((m) => m.id === agentSession.model_id);

  return {
    id: row.id as string,
    marketTicker: row.market_ticker as string,
    marketTitle: (row.market_title as string) ?? undefined,
    side: row.side as "yes" | "no",
    mint: row.mint as string,
    quantity: row.quantity as number,
    modelId: agentSession.model_id,
    modelName: model?.name || agentSession.model_name,
  };
}

// ============================================================================
// Session Positions Hook
// ============================================================================

export function useSessionPositions(sessionId: string | null) {
  const result = usePositions({ sessionId: sessionId ?? "" });

  if (!sessionId) {
    return {
      positions: [] as AgentPosition[],
      isLoading: false,
      error: undefined,
      mutate: () => Promise.resolve(),
    };
  }

  return result;
}
```

---

## Implementation Checklist

### Database
- [ ] Create `agent_positions` table with migration
- [ ] Create `upsert_agent_position` database function
- [ ] Add `'redeem'` to `agent_trades.action` constraint
- [ ] Enable realtime on `agent_positions` and `agent_trades`

### Backend - Supabase Layer
- [ ] Add `AgentPosition` types to `lib/supabase/types.ts`
- [ ] Add `upsertAgentPosition()` to `lib/supabase/agents.ts`
- [ ] Add `getAgentPositions()` to `lib/supabase/agents.ts`

### Backend - Workflow
- [ ] Update `tradingAgent.ts` workflow:
  - [ ] Remove `fetchPortfolioStep` (full portfolio fetch)
  - [ ] Add `getUsdcBalanceStep` (USDC only)
  - [ ] Update `recordResultsStep` to upsert positions
  - [ ] Ensure trades include `mint` in result for position updates

### Frontend Hooks
- [ ] Rewrite `hooks/trades/useTrades.ts`:
  - [ ] Query Supabase directly (not API route)
  - [ ] Add realtime subscription for `agent_trades`
- [ ] Rewrite `hooks/positions/usePositions.ts`:
  - [ ] Query Supabase directly (not RPC + dflow)
  - [ ] Add realtime subscription for `agent_positions`

### NOT Changed (Keep Current Implementation)
- [ ] `lib/ai/tools/retrievePosition.ts` - Continues using dflow API for on-chain truth

---

## Key Design Decisions

1. **Agent Tools vs UI Hooks**
   - Agent's `retrievePosition` tool: Uses dflow API (on-chain truth for trading decisions)
   - UI hooks: Use Supabase (recorded data for display)

2. **USDC Balance**: Fetched via single RPC call (not tracked in Supabase)
   - Accurate, simple, fast (~100ms)
   - Avoids complexity of tracking fees/slippage

3. **Position Updates**: Delta-based with atomic upsert
   - `quantity = current + bought - sold`
   - Database function ensures atomicity

4. **Redemptions**: Treated as `action: 'redeem'`
   - Distinct from sell (market may be resolved)
   - Position quantity decreases same as sell

5. **No API Routes**: Direct Supabase client + realtime
   - Consistent with existing `useChat` pattern
   - Instant updates via Supabase Realtime
   - Less code to maintain

---

## Testing

1. **Workflow writes correctly**
   - Run agent, verify `agent_trades` and `agent_positions` populated
   - Check position quantity matches buy - sell totals

2. **Hooks read from Supabase**
   - Verify `useTrades` shows trades from database
   - Verify `usePositions` shows positions from database

3. **Realtime updates**
   - Trade executes → UI updates instantly without refresh

4. **Redemption flow**
   - Market resolves → agent redeems → position goes to 0
