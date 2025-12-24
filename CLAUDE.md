# Alpha Arena - Implementation Plan

## Overview

Alpha Arena is a prediction market trading competition where AI models trade on dflow markets using real wallets. This document covers two main implementation tracks:

1. **API Refactoring** - Migrate from mocked `/api/arena` to real `/api/dflow` endpoints
2. **Model Chat** - Unified chat interface for model broadcasts and user interaction

---

# Part 1: API Refactoring (Arena → dflow)

## Current State

### `/api/arena` (To Be Refactored)
Simulated trading system with Supabase storage:

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/sessions` | Trading session management | **KEEP** |
| `/models` | AI model configuration | **KEEP** (add wallet) |
| `/broadcasts` | Model commentary | **MIGRATE** to chat |
| `/portfolios` | Virtual cash balances | **REMOVE** |
| `/positions` | Simulated positions | **REMOVE** |
| `/trades` | Simulated trade records | **REMOVE** |
| `/snapshots` | Performance history | **KEEP** (cron-populated from dflow) |

### `/api/dflow` (Real Trading)
Connected to dflow prediction market APIs:

| Endpoint | Purpose | Backend |
|----------|---------|---------|
| `/markets` | List prediction markets | dflow Metadata API |
| `/markets/[ticker]` | Market details | dflow Metadata API |
| `/prices` | Live bid/ask prices | dflow Metadata API |
| `/order` | Place orders | dflow Swap API |
| `/order/[id]` | Order status/cancel | dflow Swap API |
| `/positions` | Wallet positions | dflow + Solana RPC |
| `/trades` | Trade history | dflow Metadata API |
| `/balance` | Wallet balance | Solana RPC |

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Arena UI                                   │
│    Performance | Positions | Trades | Chat                      │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  /api/arena     │ │  /api/dflow     │ │  /api/chat      │
│  (Supabase)     │ │  (On-chain)     │ │  (Streaming)    │
│                 │ │                 │ │                 │
│  - sessions     │ │  - markets      │ │  - arena mode   │
│  - models       │ │  - prices       │ │  - user chat    │
│  - snapshots    │ │  - order        │ │                 │
│                 │ │  - positions    │ │                 │
│                 │ │  - trades       │ │                 │
│                 │ │  - balance      │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                     │
        │                     ▼
        │         ┌───────────────────────────────────────────────┐
        │         │                 dflow APIs                    │
        │         │       Swap API | Metadata API | WebSocket     │
        │         └───────────────────────────────────────────────┘
        │                     │
        ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cron Job (Vercel/External)                   │
│         Fetches balances from dflow → saves to snapshots        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Wallet Configuration

Each AI model has a wallet. Private keys are stored in environment variables (not in database).

```bash
# .env.local
ARENA_WALLET_MODEL_1=<base58_private_key>
ARENA_WALLET_MODEL_2=<base58_private_key>
ARENA_WALLET_MODEL_3=<base58_private_key>
# ... etc
```

```typescript
// types/arena.ts - Updated ArenaModel
export interface ArenaModel {
  id: string;
  name: string;
  provider: string;
  modelIdentifier: string;
  walletAddress: string;      // Public wallet address (stored in DB)
  // Private key NOT in DB - read from env at runtime
  avatarUrl?: string;
  chartColor: string;
  enabled: boolean;
  createdAt: Date;
}

// Helper to get private key for a model (server-side only)
function getModelPrivateKey(modelId: string): string | undefined {
  return process.env[`ARENA_WALLET_${modelId.toUpperCase()}`];
}
```

### Database Schema Updates

```sql
-- Add wallet address to arena_models (public address only)
ALTER TABLE arena_models
ADD COLUMN wallet_address TEXT;

-- Remove simulated trading tables (after migration)
DROP TABLE IF EXISTS model_portfolios;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS trades;

-- Keep for arena-specific data
-- trading_sessions (unchanged)
-- arena_models (updated with wallet_address)
-- performance_snapshots (populated by cron from dflow balances)
-- arena_chat_messages (new, for model chat)
```

---

## Performance Snapshots (Cron-Based)

Snapshots are **historical balance recordings** used to draw the performance chart. A scheduled job fetches balances from dflow and stores them in Supabase.

### Why Keep Snapshots?

- **Historical data** - Show how models performed over time (not just current standings)
- **Resilience** - Data survives if dflow API is temporarily unavailable
- **Lower API load** - Query dflow once per interval, not on every page load
- **Chart visualization** - Recharts needs time-series data points

### Snapshot Cron Job

```typescript
// app/api/cron/snapshots/route.ts
// Triggered by Vercel Cron or external scheduler

import { getArenaModels, getActiveSession, createBulkSnapshots } from "@/lib/supabase/arena";

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Get all enabled models with wallets
    const models = await getArenaModels(true);
    const modelsWithWallets = models.filter(m => m.walletAddress);

    // Get active session
    const session = await getActiveSession();
    if (!session || session.status !== "running") {
      return Response.json({ message: "No active session" });
    }

    // Fetch live prices for position valuation
    const pricesRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/dflow/prices`
    );
    const pricesData = await pricesRes.json();
    const priceMap = new Map<string, number>();
    if (Array.isArray(pricesData)) {
      pricesData.forEach((p: { market_ticker: string; yes_ask: string }) => {
        // Use yes_ask as the mark price for positions
        priceMap.set(p.market_ticker, parseFloat(p.yes_ask) || 0);
      });
    }

    // Fetch balance + positions for each model from dflow
    const snapshots = await Promise.all(
      modelsWithWallets.map(async (model) => {
        // Get cash balance
        const balanceRes = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL}/api/dflow/balance?wallet=${model.walletAddress}`
        );
        const balanceData = await balanceRes.json();
        const cashBalance = parseFloat(balanceData.formatted) || 0;

        // Get positions
        const positionsRes = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL}/api/dflow/positions?wallet=${model.walletAddress}`
        );
        const positionsData = await positionsRes.json();
        
        // Calculate position values
        let positionsValue = 0;
        if (positionsData.positions && Array.isArray(positionsData.positions)) {
          positionsValue = positionsData.positions.reduce(
            (sum: number, pos: { market_ticker: string; quantity: number; outcome: string }) => {
              const price = priceMap.get(pos.market_ticker) || 0;
              // For "yes" positions, use yes price; for "no", use (1 - yes price)
              const markPrice = pos.outcome === "yes" ? price : (1 - price);
              return sum + (pos.quantity * markPrice);
            },
            0
          );
        }

        // Total account value = cash + positions
        const accountValue = cashBalance + positionsValue;

        return {
          sessionId: session.id,
          modelId: model.id,
          accountValue,
        };
      })
    );

    // Save all snapshots
    await createBulkSnapshots(snapshots);

    return Response.json({
      success: true,
      count: snapshots.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Snapshot cron failed:", error);
    return Response.json({ error: "Failed to create snapshots" }, { status: 500 });
  }
}
```

### Vercel Cron Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/snapshots",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

This runs every 15 minutes. Adjust as needed (e.g., `*/5` for every 5 minutes).

---

## API Endpoint Mapping

### Positions: `/api/arena/positions` → `/api/dflow/positions`

**Before (simulated):**
```typescript
GET /api/arena/positions?portfolioId=xxx
// Returns positions from Supabase
```

**After (on-chain):**
```typescript
GET /api/dflow/positions?wallet=<model_wallet>&tickers=TICKER1,TICKER2
// Returns actual token holdings from Solana
```

### Trades: `/api/arena/trades` → `/api/dflow/trades`

**Before (simulated):**
```typescript
GET /api/arena/trades?sessionId=xxx
// Returns trades from Supabase
```

**After (on-chain):**
```typescript
GET /api/dflow/trades?wallet=<model_wallet>&limit=50
// Returns actual trade history from dflow
```

### Balance: `/api/arena/portfolios` → `/api/dflow/balance`

**Before (simulated):**
```typescript
GET /api/arena/portfolios?sessionId=xxx
// Returns cash_balance from Supabase
```

**After (on-chain):**
```typescript
GET /api/dflow/balance?wallet=<model_wallet>&currency=USDC
// Returns actual USDC balance from Solana
```

### Order Execution: via `/api/dflow/order`

```typescript
POST /api/dflow/order
{
  "market_ticker": "BTCD-25DEC0313-T92749.99",
  "side": "yes",
  "action": "buy",
  "quantity": 100,
  "limit_price": 0.65,
  "slippage_tolerance": 0.02
}
// Executes real trade on dflow via Swap API
```

---

## Hook Refactoring

### `usePositions` - Fetch from dflow

```typescript
// lib/arena/hooks/usePositions.ts

interface UsePositionsOptions {
  sessionId: string;
  modelId?: string;  // Filter by specific model
}

export function usePositions({ sessionId, modelId }: UsePositionsOptions) {
  const { data: models } = useArenaModels();
  
  // Get wallets for models in this session
  const wallets = useMemo(() => {
    if (modelId) {
      const model = models?.find(m => m.id === modelId);
      return model?.walletAddress ? [model.walletAddress] : [];
    }
    return models?.map(m => m.walletAddress).filter(Boolean) || [];
  }, [models, modelId]);
  
  // Fetch positions from dflow for each wallet
  const { data, isLoading, error } = useQuery({
    queryKey: ['positions', wallets],
    queryFn: async () => {
      const results = await Promise.all(
        wallets.map(wallet => 
          fetch(`/api/dflow/positions?wallet=${wallet}`).then(r => r.json())
        )
      );
      return results.flatMap(r => r.positions || []);
    },
    enabled: wallets.length > 0,
    refetchInterval: 30000,  // Refresh every 30s
  });
  
  return { positions: data || [], isLoading, error };
}
```

### `useTrades` - Fetch from dflow

```typescript
// lib/arena/hooks/useTrades.ts

interface UseTradesOptions {
  sessionId: string;
  modelId?: string;
  limit?: number;
}

export function useTrades({ sessionId, modelId, limit = 50 }: UseTradesOptions) {
  const { data: models } = useArenaModels();
  
  const wallets = useMemo(() => {
    if (modelId) {
      const model = models?.find(m => m.id === modelId);
      return model?.walletAddress ? [model.walletAddress] : [];
    }
    return models?.map(m => m.walletAddress).filter(Boolean) || [];
  }, [models, modelId]);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['trades', wallets, limit],
    queryFn: async () => {
      const results = await Promise.all(
        wallets.map(wallet =>
          fetch(`/api/dflow/trades?wallet=${wallet}&limit=${limit}`).then(r => r.json())
        )
      );
      // Merge and sort by timestamp
      return results
        .flat()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    },
    enabled: wallets.length > 0,
    refetchInterval: 10000,
  });
  
  return { trades: data || [], isLoading, error };
}
```

### `usePerformance` - Unchanged (reads from snapshots)

The existing `usePerformance` hook continues to work as-is. It reads from the `performance_snapshots` table, which is now populated by the cron job instead of simulated data.

```typescript
// lib/arena/hooks/usePerformance.ts - NO CHANGES NEEDED
// Already fetches from /api/arena/snapshots which reads from Supabase
```

---

## Agent Tool Updates

AI agents use tools from `lib/ai/tools/markets/` which already call `/api/dflow`. No changes needed for:

- `getMarketsTool` - Discover markets
- `getMarketDetailsTool` - Market info
- `getMarketPricesTool` - Live prices
- `placeOrderTool` - Execute trades
- `getOrderStatusTool` - Check order
- `cancelOrderTool` - Cancel order
- `getPositionsTool` - Get positions
- `getBalanceTool` - Get balance
- `getTradeHistoryTool` - Trade history

### Agent Configuration Update

```typescript
// lib/ai/agents/predictionMarketAgent.ts

interface PredictionMarketAgentConfig {
  modelId: string;
  modelIdentifier: string;
  walletAddress: string;  // Agent's trading wallet (public)
  sessionId: string;
}

// Pass wallet to all trading tools
const agentContext = {
  wallet: config.walletAddress,
  sessionId: config.sessionId,
};
```

---

## Files to Modify

### API Routes
```
app/api/arena/
├── sessions/route.ts     # KEEP - trading session management
├── models/route.ts       # UPDATE - add wallet_address field
├── snapshots/route.ts    # KEEP - unchanged, reads from Supabase
├── portfolios/route.ts   # DELETE
├── positions/route.ts    # DELETE
├── trades/route.ts       # DELETE
├── broadcasts/route.ts   # DELETE (migrate to chat)

app/api/cron/
└── snapshots/route.ts    # NEW - cron job to populate snapshots from dflow
```

### Hooks
```
lib/arena/hooks/
├── usePositions.ts       # REWRITE - fetch from /api/dflow/positions
├── useTrades.ts          # REWRITE - fetch from /api/dflow/trades
├── usePerformance.ts     # KEEP - already reads from snapshots
├── useBroadcasts.ts      # DELETE (replaced by chat)
├── useMarketPrices.ts    # KEEP - already uses dflow WebSocket
└── index.ts              # UPDATE exports
```

### Supabase
```
lib/supabase/arena.ts     # SIMPLIFY - remove portfolio/position/trade functions
```

### Types
```
types/arena.ts            # UPDATE - add walletAddress to ArenaModel, remove simulated types
```

### Config
```
vercel.json               # ADD - cron job configuration
```

---

## Migration Steps

### Phase 1: Wallet Infrastructure
- [ ] Add `wallet_address` column to `arena_models` table
- [ ] Update `ArenaModel` type with `walletAddress` field
- [ ] Set up wallet private keys in environment variables
- [ ] Update `/api/arena/models` to handle wallet_address field
- [ ] Manually add wallet addresses for each model in DB

### Phase 2: Snapshot Cron
- [ ] Create `/api/cron/snapshots/route.ts`
- [ ] Add cron configuration to `vercel.json`
- [ ] Set `CRON_SECRET` environment variable
- [ ] Test cron job locally with manual trigger
- [ ] Deploy and verify snapshots are being recorded

### Phase 3: Complete dflow Endpoints
- [ ] Implement full on-chain balance query in `/api/dflow/balance`
- [ ] Implement full on-chain position query in `/api/dflow/positions`
- [ ] Test `/api/dflow/order` with real transactions

### Phase 4: Refactor Hooks
- [ ] Rewrite `usePositions` to use dflow
- [ ] Rewrite `useTrades` to use dflow
- [ ] Update components to use new hook signatures

### Phase 5: Cleanup
- [ ] Remove `/api/arena/portfolios`
- [ ] Remove `/api/arena/positions`
- [ ] Remove `/api/arena/trades`
- [ ] Remove `/api/arena/broadcasts` (after chat migration)
- [ ] Drop unused Supabase tables (`model_portfolios`, `positions`, `trades`, `broadcasts`)
- [ ] Remove unused Supabase functions from `lib/supabase/arena.ts`

---

# Part 2: Model Chat

> **Full implementation details:** See [docs/MODEL_CHAT_IMPLEMENTATION.md](docs/MODEL_CHAT_IMPLEMENTATION.md)

## Overview

The Model Chat replaces the broadcast system with a unified chat where:
- **Models** stream their trading analysis, trades, and commentary
- **Users** ask questions and receive streaming responses from an **Assistant**
- All messages use ai-sdk's `UIMessage` format with custom metadata
- Messages belong to the **trading session** (no separate chat session)

## Integration with API Refactoring

After the dflow migration, the chat system needs to work with the updated architecture:

### Model Info for Chat Display

The chat displays model names and colors. With the refactoring:

| What | Before | After |
|------|--------|-------|
| Model list | `GET /api/arena/models` | `GET /api/arena/models` (unchanged) |
| Model info | From Supabase | From Supabase (same) |

**No conflict** - `/api/arena/models` is kept and just adds `wallet_address`.

### Chat Messages Storage

| What | Endpoint | Notes |
|------|----------|-------|
| Load messages | `GET /api/arena/chat-messages` | **NEW** - reads from `arena_chat_messages` |
| Send message | `POST /api/chat` with `mode: "arena"` | Uses existing chat route |
| Model broadcasts | `saveArenaChatMessage()` | Replaces `createBroadcast()` |

### API Endpoints Summary (Post-Refactoring)

```
/api/arena/
├── sessions/           # KEEP - session management
├── models/             # KEEP - model config (+ wallet_address)
├── snapshots/          # KEEP - performance history (cron-populated)
└── chat-messages/      # NEW - arena chat message retrieval

/api/chat/              # EXISTING - add mode: "arena" support

/api/cron/
└── snapshots/          # NEW - populate snapshots from dflow
```

## Key Components

### ModelChatFeed

Main component that needs `models` prop for displaying author info:

```tsx
import { ModelChatFeed } from "@/components/chat";
import { useArenaModels } from "@/lib/arena/hooks";

function ArenaChat({ sessionId }: { sessionId: string }) {
  const { models } = useArenaModels();
  
  return (
    <ModelChatFeed
      sessionId={sessionId}
      models={models}
      selectedModelId={null}
    />
  );
}
```

### Hook: useArenaChatMessages

Fetches messages from `arena_chat_messages` table:

```typescript
const {
  messages,
  isLoading,
  input,
  setInput,
  sendMessage,
} = useArenaChatMessages({ sessionId });
```

## Chat Migration Steps

### Phase 1: Database & Types
- [ ] Create `arena_chat_messages` table (see MODEL_CHAT_IMPLEMENTATION.md)
- [ ] Add `ArenaChatMetadata` type to `types/chat.ts`
- [ ] Add Supabase functions: `getArenaChatMessages`, `saveArenaChatMessage`

### Phase 2: API Routes
- [ ] Create `GET /api/arena/chat-messages` route
- [ ] Add `mode: "arena"` handling to `/api/chat/route.ts`
- [ ] Add `ARENA_ASSISTANT_PROMPT` to chat agent

### Phase 3: Components & Hooks
- [ ] Create `useArenaChatMessages` hook
- [ ] Create `ModelChatFeed`, `ChatMessage`, `ChatInput` components
- [ ] Add arena cache functions to `lib/cache/chat.ts`

### Phase 4: Integration
- [ ] Update Arena page to use `ModelChatFeed`
- [ ] Update model agents to use `saveArenaChatMessage()` instead of `createBroadcast()`
- [ ] Test end-to-end: model broadcasts + user questions + assistant responses

### Phase 5: Cleanup
- [ ] Remove `components/broadcast/` directory
- [ ] Remove `lib/arena/hooks/useBroadcasts.ts`
- [ ] Remove `/api/arena/broadcasts` route
- [ ] Optionally drop `broadcasts` table (or keep for historical data)

---

# Design Principles

1. **On-chain as Source of Truth** - Positions, trades, balances come from dflow/Solana
2. **Supabase for Arena Metadata** - Sessions, models, chat messages, snapshots
3. **Wallet Keys in Env Vars** - Private keys never stored in database
4. **Cron for Historical Data** - Snapshots recorded periodically for performance charts
5. **UIMessage + Metadata** - Use ai-sdk's `UIMessage` directly for chat
6. **Streaming for All** - Both model broadcasts and assistant responses stream
7. **Keep `/api/arena/models`** - Still needed for model config (name, color, wallet address)
