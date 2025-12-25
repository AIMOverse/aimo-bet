# Alpha Arena Implementation Summary

This document summarizes the implementation of the Alpha Arena API refactoring and Model Chat system.

## Overview

The implementation follows the plan outlined in `CLAUDE.md`, migrating from a simulated trading system to real on-chain trading via dflow APIs, and replacing the broadcast system with a unified chat interface.

---

## Recent Refactoring (December 2025)

### Phase 1: Database Cleanup

Removed deprecated tables and files:

**Deleted Files:**
- `lib/supabase/messages.ts` - Old user chat message functions
- `lib/supabase/files.ts` - Library file management (unused)
- `app/api/sessions/messages/route.ts` - Old messages API endpoint
- `types/library.ts` - Library file types

**Updated Files:**
- `lib/supabase/types.ts` - Removed deprecated types (DbChatSession, DbChatMessage, DbLibraryFile, etc.)

### Phase 2: Global Session

Implemented the global session system:

**New Functions (`lib/supabase/arena.ts`):**
```typescript
export async function getGlobalSession(): Promise<TradingSession>
```
- Returns existing running "Global Arena" session or creates one
- Used when no specific sessionId is provided to `/api/chat`

**Updated Chat API (`app/api/chat/route.ts`):**
- Removed `mode` parameter (no more "user-chat" vs "arena")
- Uses global session when `sessionId` is null
- All messages saved to `arena_chat_messages` with metadata

**Simplified Chat Agent (`lib/ai/agents/chatAgent.ts`):**
- Removed mode-switching logic
- Uses `ARENA_ASSISTANT_PROMPT` directly
- Uses `gpt-4o-mini` as the default model

### Phase 3: Trading Cron

Created automated trading system:

**New File (`app/api/cron/trading/route.ts`):**
- Runs every 15 minutes via Vercel Cron
- Gets global session via `getGlobalSession()`
- Runs `predictionMarketAgent` for each enabled model with wallet
- Saves trades and broadcasts to `arena_chat_messages`

**Updated `vercel.json`:**
```json
{
  "crons": [
    { "path": "/api/cron/snapshots", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/trading", "schedule": "*/15 * * * *" }
  ]
}
```

### Phase 4: Code Cleanup

- Updated `types/chat.ts` - Removed deprecated types, kept arena types only
- Updated `docs/MODEL_CHAT_IMPLEMENTATION.md` - Removed user-chat references

---

## Architecture

### Simplified Structure

The codebase has been simplified with the following changes:

1. **Hardcoded Models** - Arena models defined in `lib/ai/models/catalog.ts`
2. **Consolidated Hooks** - Arena hooks in `hooks/arena/`
3. **Global Session** - Single "Global Arena" session for all chat
4. **Cron Trading** - Automated trading every 15 minutes

### Directory Structure

```
lib/
├── ai/
│   ├── agents/
│   │   ├── chatAgent.ts           # Arena assistant (simplified)
│   │   └── predictionMarketAgent.ts
│   └── models/
│       └── catalog.ts             # Model definitions with wallets
├── supabase/
│   ├── arena.ts                   # getGlobalSession, chat, snapshots
│   └── types.ts                   # Arena types only
└── arena/
    ├── constants.ts               # Polling intervals, chart config
    └── utils.ts                   # Chart utilities

hooks/
├── arena/                         # Arena-specific hooks
└── chat/
    └── useArenaChatMessages.ts    # Arena chat hook

app/api/
├── chat/                          # Chat endpoint (global session)
├── cron/
│   ├── snapshots/                 # Performance snapshots
│   └── trading/                   # Model trading loop
└── dflow/                         # On-chain operations
```

### API Endpoints

```
/api/chat                   # Chat (uses global session if no sessionId)

/api/arena/
├── sessions/               # Trading session management
├── snapshots/              # Performance history
└── chat-messages/          # Arena chat message retrieval

/api/dflow/
├── markets/                # List prediction markets
├── markets/[ticker]/       # Market details
├── prices/                 # Live bid/ask prices
├── order/                  # Place orders
├── order/[id]/             # Order status/cancel
├── positions/              # On-chain wallet positions
├── trades/                 # Trade history
└── balance/                # On-chain wallet balance

/api/cron/
├── snapshots/              # Snapshot population (every 15 min)
└── trading/                # Model trading loop (every 15 min)
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
│     / (charts)  |  /chat  |  /positions  |  /trades            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  /api/sessions  │ │  /api/dflow/*   │ │  /api/chat      │
│  /api/performance│ │  (On-chain)     │ │  (Streaming)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                     │                   │
        ▼                     ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Supabase     │ │   dflow APIs    │ │   Chat Agent    │
│                 │ │  Swap/Metadata  │ │                 │
│ - trading_sessions │ └─────────────────┘ └─────────────────┘
│ - performance_snapshots │
│ - arena_chat_messages │
└─────────────────┘
        ▲
        │
┌─────────────────┐
│  Cron Jobs      │
│ - snapshots     │
│ - trading       │
└─────────────────┘
```

---

## Database Schema (Current)

### `trading_sessions`
```sql
id              UUID PRIMARY KEY
name            TEXT                -- e.g., "Global Arena"
status          TEXT                -- 'setup' | 'running' | 'paused' | 'completed'
starting_capital NUMERIC            -- default 10000
started_at      TIMESTAMPTZ
ended_at        TIMESTAMPTZ
created_at      TIMESTAMPTZ
```

### `performance_snapshots`
```sql
id              UUID PRIMARY KEY
session_id      UUID REFERENCES trading_sessions(id)
model_id        TEXT                -- e.g., "openrouter/gpt-4o"
account_value   NUMERIC
timestamp       TIMESTAMPTZ
```

### `arena_chat_messages`
```sql
id              TEXT PRIMARY KEY    -- nanoid
session_id      UUID REFERENCES trading_sessions(id)
role            TEXT                -- 'user' | 'assistant' | 'system'
parts           JSONB               -- UIMessage parts array
metadata        JSONB               -- ArenaChatMetadata
created_at      TIMESTAMPTZ
```

### Tables to DROP (deprecated)
- `chat_sessions` - replaced by unified arena system
- `chat_messages` - replaced by `arena_chat_messages`
- `library_files` - unused
- `library` storage bucket - unused

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
import { useArenaChatMessages } from "@/hooks/chat";

// Arena chat (uses global session)
const { messages, sendMessage } = useArenaChatMessages({ sessionId });
```

---

## Testing Recommendations

1. **Global Session**
   - Verify `getGlobalSession()` creates session on first call
   - Verify subsequent calls return the same session

2. **Trading Cron**
   - Test manually: `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/trading`
   - Verify trades are being logged to arena_chat_messages

3. **Chat System**
   - Test chat without sessionId (should use global session)
   - Verify messages are saved with correct metadata

4. **Wallet Configuration**
   - Add wallet addresses to models in `lib/ai/models/catalog.ts`
   - Set up wallet private keys in environment variables

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
