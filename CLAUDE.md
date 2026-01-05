# Agent Trigger Architecture Refactor

Refactor the agent workflow trigger system to separate **position management** (real-time, filtered) from **market discovery** (periodic cron).

---

## Overview

### Current Problem

The `dflow-relay.ts` subscribes to ALL markets and triggers ALL agents on every signal. This causes:
- 100+ triggers per minute during active markets
- 7 agents × N signals = workflow explosion
- Agents wake up for markets they don't hold

### New Architecture

| Trigger Type | Purpose | Frequency | Which Agents |
|--------------|---------|-----------|--------------|
| **Cron (periodic)** | Market discovery + portfolio review | Every 5 minutes | All agents |
| **Position signal** | React to held position movements | Real-time (filtered) | Only agents holding that ticker |

### Key Constraints

1. **One workflow per agent at a time** - Skip triggers if agent already has active workflow
2. **Derive positions from `agent_trades`** - No new table, calculate on demand
3. **Filtered signals** - Only `price_swing` (10%) and `volume_spike` (10x) for positions
4. **Exclude `orderbook_imbalance`** - Too noisy, fires constantly

---

## Implementation Guide

### Phase 1: Add Position Query Function

**File:** `lib/supabase/agents.ts`

Add function to derive held tickers from trade history:

```typescript
/**
 * Get market tickers where an agent currently holds a position.
 * Derives from agent_trades by calculating net quantity (buys - sells) per ticker.
 */
export async function getAgentHeldTickers(
  agentSessionId: string
): Promise<string[]> {
  const client = createServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("agent_trades")
    .select("market_ticker, action, quantity")
    .eq("agent_session_id", agentSessionId);

  if (error || !data) {
    console.error("[agents] Failed to fetch trades for positions:", error);
    return [];
  }

  // Aggregate net quantity per ticker
  const positions = new Map<string, number>();
  
  for (const trade of data) {
    const current = positions.get(trade.market_ticker) || 0;
    const delta = trade.action === "buy" ? trade.quantity : -trade.quantity;
    positions.set(trade.market_ticker, current + delta);
  }

  // Return tickers with positive net quantity
  return Array.from(positions.entries())
    .filter(([_, qty]) => qty > 0)
    .map(([ticker, _]) => ticker);
}

/**
 * Get all agents (by modelId) that hold a position in a specific market ticker.
 */
export async function getAgentsHoldingTicker(
  sessionId: string,
  marketTicker: string
): Promise<string[]> {
  const client = createServerClient();
  if (!client) return [];

  // Get all agent sessions for this trading session
  const { data: sessions, error: sessionsError } = await client
    .from("agent_sessions")
    .select("id, model_id")
    .eq("session_id", sessionId);

  if (sessionsError || !sessions) {
    console.error("[agents] Failed to fetch agent sessions:", sessionsError);
    return [];
  }

  // For each agent, check if they hold this ticker
  const holdingAgents: string[] = [];

  for (const session of sessions) {
    const heldTickers = await getAgentHeldTickers(session.id);
    if (heldTickers.includes(marketTicker)) {
      holdingAgents.push(session.model_id);
    }
  }

  return holdingAgents;
}
```

---

### Phase 2: Update Trigger Endpoint

**File:** `app/api/agents/trigger/route.ts`

#### 2.1 Add `filterByPosition` flag to request type

```typescript
interface TriggerRequest {
  /** Specific model to trigger (omit to trigger all enabled models) */
  modelId?: string;
  /** Market signal data (for market-triggered runs) */
  signal?: MarketSignal;
  /** What initiated this trigger */
  triggerType: TriggerType;
  /** When true, uses test prompt that forces a $1-5 trade */
  testMode?: boolean;
  /** When true, only trigger agents holding a position in signal.ticker */
  filterByPosition?: boolean;  // NEW
}
```

#### 2.2 Add position filtering logic

After getting `modelsToTrigger`, add filtering:

```typescript
const { modelId, signal, triggerType = "manual", testMode = false, filterByPosition = false } = body;

// ... existing code to get modelsToTrigger ...

// NEW: Filter to only agents holding the signaled ticker
let filteredModels = modelsToTrigger;

if (filterByPosition && signal?.ticker) {
  const session = await getGlobalSession();
  const holdingModelIds = await getAgentsHoldingTicker(session.id, signal.ticker);
  
  filteredModels = modelsToTrigger.filter(m => holdingModelIds.includes(m.id));
  
  console.log(
    `[agents/trigger] Position filter: ${holdingModelIds.length} agents hold ${signal.ticker}, ` +
    `triggering ${filteredModels.length} of ${modelsToTrigger.length}`
  );
  
  if (filteredModels.length === 0) {
    return NextResponse.json({
      success: true,
      triggerType,
      signal: { type: signal.type, ticker: signal.ticker },
      spawned: 0,
      failed: 0,
      workflows: [],
      errors: [],
      message: `No agents hold position in ${signal.ticker}`,
    } satisfies TriggerResponse);
  }
}
```

#### 2.3 Add active workflow check before spawning

```typescript
const results = await Promise.allSettled(
  filteredModels.map(async (model): Promise<SpawnedWorkflow> => {
    // NEW: Check if agent already has active workflow
    const existingRun = Array.from(activeWorkflowsMap.entries())
      .find(([_, meta]) => meta.modelId === model.id);

    if (existingRun) {
      console.log(`[agents/trigger] Skipping ${model.id}, workflow already running: ${existingRun[0]}`);
      throw new Error("Workflow already running");
    }

    // ... rest of existing code
  })
);
```

#### 2.4 Add required imports

```typescript
import { getGlobalSession } from "@/lib/supabase/db";
import { getAgentsHoldingTicker } from "@/lib/supabase/agents";
```

---

### Phase 3: Update dflow-relay Signal Detection

**File:** `party/dflow-relay.ts`

#### 3.1 Update Thresholds

```typescript
const SWING_THRESHOLD = 0.10; // 10% price change (was 0.05)
const VOLUME_SPIKE_MULTIPLIER = 10; // 10x average volume (was 5)
```

#### 3.2 Disable Orderbook Imbalance Triggers

```typescript
// In handleDflowMessage(), comment out or remove orderbook signal:
private async handleDflowMessage(msg: DflowMessage) {
  let signal: Signal | null = null;

  switch (msg.channel) {
    case "prices":
      signal = this.detectPriceSwing(msg);
      break;
    case "trades":
      signal = this.detectVolumeSpike(msg);
      break;
    case "orderbook":
      // DISABLED: Too noisy for position management
      // signal = this.detectOrderbookImbalance(msg);
      break;
  }

  // ... rest unchanged
}
```

#### 3.3 Simplify triggerAgents() with filterByPosition flag

Replace `triggerAgents()` with simplified version that uses the new flag:

```typescript
/**
 * Trigger agents via Vercel API with position filtering.
 * The trigger endpoint handles filtering to only agents holding the ticker.
 */
private async triggerAgents(signal: Signal) {
  const vercelUrl = this.room.env.VERCEL_URL as string | undefined;
  const webhookSecret = this.room.env.WEBHOOK_SECRET as string | undefined;

  if (!vercelUrl || !webhookSecret) {
    console.warn("[dflow-relay] Missing VERCEL_URL or WEBHOOK_SECRET");
    return;
  }

  try {
    const response = await fetch(`${vercelUrl}/api/agents/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify({
        signal,
        triggerType: "market",
        filterByPosition: true,  // NEW: Only trigger agents holding this ticker
      }),
    });

    if (!response.ok) {
      console.error(`[dflow-relay] Failed to trigger agents: ${response.status}`);
    } else {
      const result = await response.json() as { spawned: number; failed: number; message?: string };
      if (result.spawned > 0) {
        console.log(`[dflow-relay] Triggered ${result.spawned} agent(s) for ${signal.ticker}`);
      } else {
        console.log(`[dflow-relay] ${result.message || "No agents triggered"}`);
      }
    }
  } catch (error) {
    console.error("[dflow-relay] Error triggering agents:", error);
  }
}
```

---

### Phase 4: Update Cron Schedule

**File:** `vercel.json`

Update cron schedule to 5 minutes:

```json
{
  "crons": [
    {
      "path": "/api/agents/cron",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## Implementation Checklist

### Phase 1: Position Query
- [ ] Add `getAgentHeldTickers()` to `lib/supabase/agents.ts`
- [ ] Add `getAgentsHoldingTicker()` to `lib/supabase/agents.ts`
- [ ] Export new functions from module

### Phase 2: Trigger Endpoint
- [ ] Add `filterByPosition` flag to `TriggerRequest` interface
- [ ] Add position filtering logic using `getAgentsHoldingTicker()`
- [ ] Add active workflow check before spawning
- [ ] Add imports for `getGlobalSession` and `getAgentsHoldingTicker`
- [ ] Update response type to include optional `message` field

### Phase 3: dflow-relay Updates
- [ ] Update `SWING_THRESHOLD` to 0.10 (10%)
- [ ] Update `VOLUME_SPIKE_MULTIPLIER` to 10
- [ ] Disable `orderbook_imbalance` detection
- [ ] Update `triggerAgents()` to pass `filterByPosition: true`

### Phase 4: Cron Schedule
- [ ] Update `vercel.json` cron to `*/5 * * * *`

---

## Signal Configuration Reference

| Signal | Enabled | Threshold | Use Case |
|--------|---------|-----------|----------|
| `price_swing` | Yes | 10% change | Position P&L impact |
| `volume_spike` | Yes | 10x average | Momentum/news indicator |
| `orderbook_imbalance` | No | - | Too noisy |

---

## Architecture Flow

### Cron Trigger (Market Discovery)
```
Every 5 min
  → /api/agents/cron
  → All 7 agents (if not already running)
  → buildPeriodicPrompt()
  → discoverEvent + webSearch
  → Agent decides to trade or hold
```

### Position Signal (Real-time)
```
dflow WebSocket
  → price_swing or volume_spike detected
  → POST /api/agents/trigger { signal, filterByPosition: true }
  → Trigger endpoint filters to agents holding ticker
  → Only those agents spawn workflows
  → buildSignalPrompt() with signal context
  → Agent decides to adjust position
```

---

## Future Enhancements

Once external data sources are added:

1. **News-driven discovery**: Trigger discovery for specific categories when news breaks
2. **Expiration alerts**: Notify agents when held positions approach expiration
3. **Resolution detection**: Auto-trigger redeem workflow when markets resolve
