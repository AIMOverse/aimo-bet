# Alpha Arena Implementation Summary

This document summarizes the implementation of the Alpha Arena API refactoring and Model Chat system.

## Overview

The implementation follows the plan outlined in `CLAUDE.md`, migrating from a simulated trading system to real on-chain trading via dflow APIs, and replacing the broadcast system with a unified chat interface.

---

## Architecture

### Simplified Structure

The codebase has been simplified with the following changes:

1. **Hardcoded Models** - Arena models are now defined in `lib/arena/models.ts` instead of being stored in the database
2. **Consolidated Hooks** - Arena hooks moved from `lib/arena/hooks/` to `hooks/arena/`
3. **Removed Mock Data** - Deleted `lib/arena/mock/` directory (no longer needed with real dflow data)
4. **Removed API Wrapper** - Deleted `lib/arena/api.ts` (hooks call API routes directly)

### Directory Structure

```
lib/arena/
├── constants.ts      # Polling intervals, chart config, starting capital
├── models.ts         # Hardcoded ARENA_MODELS array + helper functions
└── utils.ts          # Chart utilities (snapshotsToChartData, getLatestModelValues)

hooks/
├── arena/
│   ├── index.ts          # Exports all arena hooks
│   ├── useArenaModels.ts # Get models from hardcoded config
│   ├── usePerformance.ts # Fetch snapshots, convert to chart data
│   ├── usePositions.ts   # Fetch positions from dflow
│   ├── useTrades.ts      # Fetch trades from dflow
│   └── useMarketPrices.ts # WebSocket price subscription
└── chat/
    ├── useChatMessages.ts      # User chat hook
    ├── useArenaChatMessages.ts # Arena chat hook
    └── useSessions.ts          # Chat session management
```

### API Endpoints

```
/api/arena/
├── sessions/           # Trading session management
├── snapshots/          # Performance history (cron-populated)
└── chat-messages/      # Arena chat message retrieval

/api/chat/              # Chat endpoint with mode: "arena" support

/api/dflow/
├── markets/            # List prediction markets
├── markets/[ticker]/   # Market details
├── prices/             # Live bid/ask prices
├── order/              # Place orders
├── order/[id]/         # Order status/cancel
├── positions/          # On-chain wallet positions
├── trades/             # Trade history
└── balance/            # On-chain wallet balance

/api/cron/
└── snapshots/          # Cron job for snapshot population
```

### Data Flow

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
│  - snapshots    │ │  - prices       │ │  - user chat    │
│  - chat-msgs    │ │  - order        │ │                 │
│                 │ │  - positions    │ │                 │
│                 │ │  - trades       │ │                 │
│                 │ │  - balance      │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                     │
        ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Solana RPC / dflow APIs                      │
└─────────────────────────────────────────────────────────────────┘
        ▲
        │
┌─────────────────────────────────────────────────────────────────┐
│                    Cron Job (Every 15 min)                      │
│         Fetches balances from dflow → saves to snapshots        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Model Configuration

Models are hardcoded in `lib/arena/models.ts`:

```typescript
import { ARENA_MODELS, getArenaModels, getArenaModel } from "@/lib/arena/models";

// Get all enabled models
const models = getArenaModels();

// Get specific model by ID
const model = getArenaModel("gpt-4o");
```

To add wallet addresses for trading, update the `walletAddress` field in the model config. Private keys are stored in environment variables (`ARENA_WALLET_<MODEL_ID>`).

---

## Environment Variables Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# OpenRouter API (for AI models)
OPENROUTER_API_KEY=...

# Solana RPC (optional, defaults to mainnet-beta)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Cron job security
CRON_SECRET=...

# Base URL for internal API calls
NEXT_PUBLIC_BASE_URL=https://your-domain.com

# Model wallet private keys (stored in env, not in DB)
ARENA_WALLET_GPT_4O=<base58_private_key>
ARENA_WALLET_CLAUDE_SONNET_4=<base58_private_key>
# ... etc
```

---

## Files Changed (Recent Refactoring)

### New Files
- `lib/arena/models.ts` - Hardcoded arena models
- `lib/arena/utils.ts` - Chart utilities
- `hooks/arena/` - All arena hooks (moved from lib/arena/hooks/)

### Modified Files
- `app/page.tsx` - Uses real hooks instead of mock data
- `components/trades/TradesFeed.tsx` - Uses DflowTradeWithModel type
- `components/trades/TradeCard.tsx` - Uses DflowTradeWithModel type
- `components/positions/PositionsTable.tsx` - Uses DflowPosition type
- `components/layout/AppTabs.tsx` - Uses ARENA_MODELS from models.ts
- `components/index/PerformanceChart.tsx` - Uses ARENA_MODELS from models.ts
- `components/index/MarketTicker.tsx` - Uses useMarketPrices from hooks/arena
- `app/api/cron/snapshots/route.ts` - Uses ARENA_MODELS instead of DB
- `app/api/arena/sessions/route.ts` - Removed portfolio creation
- `lib/arena/constants.ts` - Removed MODEL_COLORS and DEFAULT_ARENA_MODELS
- `lib/supabase/arena.ts` - Removed model CRUD functions
- `lib/supabase/types.ts` - Added arena table types

### Removed Files
- `app/api/arena/models/` - No longer needed (hardcoded models)
- `lib/arena/api.ts` - No longer needed (hooks call APIs directly)
- `lib/arena/mock/` - No longer needed (real dflow data)
- `lib/arena/hooks/` - Moved to hooks/arena/

---

## Hook Usage

### Arena Hooks (`hooks/arena/`)

```typescript
import {
  useArenaModels,
  usePerformance,
  useTrades,
  useSessionTrades,
  usePositions,
  useSessionPositions,
  useMarketPrices,
} from "@/hooks/arena";

// Get models (synchronous, from config)
const { models } = useArenaModels();

// Get performance data for a session
const { chartData, snapshots, isLoading } = usePerformance(sessionId);

// Get trades for a session
const { trades, isLoading } = useSessionTrades(sessionId);

// Get positions for a session
const { positions, isLoading } = useSessionPositions(sessionId);

// Subscribe to live market prices
const { prices, isConnected } = useMarketPrices();
```

### Chat Hooks (`hooks/chat/`)

```typescript
import { useChatMessages, useArenaChatMessages, useSessions } from "@/hooks/chat";

// User chat
const { messages, sendMessage } = useChatMessages({ sessionId });

// Arena chat
const { messages, sendMessage } = useArenaChatMessages({ sessionId });

// Session management
const { sessions, updateSession, deleteSession } = useSessions();
```

---

## Testing Recommendations

1. **Wallet Configuration**
   - Add wallet addresses to models in `lib/arena/models.ts`
   - Set up wallet private keys in environment variables

2. **Cron Job**
   - Test manually: `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/snapshots`
   - Verify snapshots are being created in database

3. **On-Chain Queries**
   - Test balance endpoint with a known wallet address
   - Verify position quantities match on-chain state

4. **Chat System**
   - Test user message sending and assistant responses
   - Verify model messages are saved with correct metadata

---

## Known Limitations

1. **Solana RPC Rate Limits**
   - The positions endpoint queries multiple outcome mints sequentially
   - Consider using a dedicated RPC provider for production

2. **Trade History**
   - dflow trade history API may have different response format
   - May need adjustment based on actual API response

3. **Wallet Private Keys**
   - Currently stored in environment variables
   - Consider using a secrets manager for production
