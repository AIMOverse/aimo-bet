# Alpha Arena Implementation Summary

This document summarizes the implementation of the Alpha Arena API refactoring and Model Chat system.

## Overview

The implementation follows the plan outlined in `CLAUDE.md`, migrating from a simulated trading system to real on-chain trading via dflow APIs, and replacing the broadcast system with a unified chat interface.

---

## Part 1: API Refactoring (Arena → dflow)

### Phase 1: Wallet Infrastructure

**Completed:**

1. **Updated `ArenaModel` type** (`types/arena.ts:7`)
   - Added `walletAddress?: string` field for public wallet addresses
   - Updated `PredictionMarketAgentConfig` to use `walletAddress` instead of `portfolioId`

2. **Updated Supabase functions** (`lib/supabase/arena.ts`)
   - Updated `mapArenaModel()` to include `wallet_address`
   - Updated `createArenaModel()` to handle `wallet_address`
   - Updated `updateArenaModel()` to handle `wallet_address`

3. **Updated API route** (`app/api/arena/models/route.ts`)
   - POST handler now accepts `walletAddress`
   - PATCH handler now updates `walletAddress`

4. **Created SQL migration** (`supabase/migrations/20241225_add_wallet_address.sql`)
   - Adds `wallet_address TEXT` column to `arena_models`
   - Creates index for wallet address lookups

### Phase 2: Snapshot Cron

**Completed:**

1. **Created cron endpoint** (`app/api/cron/snapshots/route.ts`)
   - Fetches balance and positions from dflow for each model with a wallet
   - Calculates total account value (cash + position values)
   - Saves snapshots to `performance_snapshots` table
   - Secured with `CRON_SECRET` authorization

2. **Added Vercel cron configuration** (`vercel.json`)
   - Configured to run every 15 minutes: `*/15 * * * *`

### Phase 3: On-Chain Endpoints

**Completed:**

1. **Updated balance endpoint** (`app/api/dflow/balance/route.ts`)
   - Queries Solana RPC for SPL token balances
   - Uses `getTokenAccountsByOwner` RPC method
   - Returns formatted balance for USDC/CASH tokens

2. **Updated positions endpoint** (`app/api/dflow/positions/route.ts`)
   - Fetches outcome mints from dflow Metadata API
   - Queries on-chain token balances for each mint
   - Returns positions with non-zero quantities

### Phase 4: Hook Refactoring

**Completed:**

1. **Refactored `usePositions`** (`lib/arena/hooks/usePositions.ts`)
   - Now fetches from `/api/dflow/positions` instead of Supabase
   - Uses model wallet addresses to fetch positions
   - Enriches positions with model info

2. **Refactored `useTrades`** (`lib/arena/hooks/useTrades.ts`)
   - Now fetches from `/api/dflow/trades` instead of Supabase
   - Merges and sorts trades from multiple wallets
   - Enriches trades with model info

3. **Exported new types** (`lib/arena/hooks/index.ts`)
   - `DflowPosition` - Position from dflow
   - `DflowTrade` - Trade from dflow
   - `DflowTradeWithModel` - Trade enriched with model info

### Phase 5: Cleanup

**Completed:**

1. **Removed deprecated API routes:**
   - `app/api/arena/portfolios/` - Removed
   - `app/api/arena/positions/` - Removed
   - `app/api/arena/trades/` - Removed

---

## Part 2: Model Chat

### Phase 1: Database & Types

**Already Implemented:**

- `arena_chat_messages` table (migration: `20241224_create_arena_chat_messages.sql`)
- `ArenaChatMetadata` type (`types/chat.ts`)
- `ArenaChatMessage` type (`types/chat.ts`)
- Supabase functions: `getArenaChatMessages()`, `saveArenaChatMessage()`

### Phase 2: API Routes

**Already Implemented:**

- `GET /api/arena/chat-messages` - Fetch messages for a session
- `POST /api/chat` with `mode: "arena"` - Send user messages and get assistant responses

### Phase 3: Hooks

**Completed:**

1. **Created `useArenaChatMessages`** (`lib/arena/hooks/useArenaChatMessages.ts`)
   - Fetches messages from `/api/arena/chat-messages`
   - Enriches messages with author info (model name, color)
   - Provides `sendMessage()` for user input
   - Handles optimistic updates during message sending
   - Polls for new messages

### Phase 4: Agent Integration

**Completed:**

1. **Updated `PredictionMarketAgent`** (`lib/ai/agents/predictionMarketAgent.ts`)
   - Added `saveChatMessage()` method
   - Updated `executeTradingLoop()` to save messages to arena chat
   - Messages are saved with proper metadata (authorType, messageType, etc.)

### Phase 5: Cleanup

**Completed:**

1. **Removed broadcast system:**
   - `components/broadcast/` - Removed
   - `app/api/arena/broadcasts/` - Removed
   - `lib/arena/hooks/useBroadcasts.ts` - Removed
   - Updated hooks index to remove export

---

## Architecture Summary

### API Endpoints (Final State)

```
/api/arena/
├── sessions/           # Trading session management
├── models/             # Model config (+ wallet_address)
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
│  - models       │ │  - prices       │ │  - user chat    │
│  - snapshots    │ │  - order        │ │                 │
│  - chat-msgs    │ │  - positions    │ │                 │
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
ARENA_WALLET_MODEL_1=<base58_private_key>
ARENA_WALLET_MODEL_2=<base58_private_key>
# ... etc
```

---

## Files Changed

### New Files
- `app/api/cron/snapshots/route.ts`
- `lib/arena/hooks/useArenaChatMessages.ts`
- `supabase/migrations/20241225_add_wallet_address.sql`
- `vercel.json`
- `docs/IMPLEMENTATION_SUMMARY.md`

### Modified Files
- `types/arena.ts` - Added walletAddress fields
- `lib/supabase/arena.ts` - Updated model CRUD functions
- `app/api/arena/models/route.ts` - Added walletAddress handling
- `app/api/dflow/balance/route.ts` - Implemented on-chain queries
- `app/api/dflow/positions/route.ts` - Implemented on-chain queries
- `lib/arena/hooks/usePositions.ts` - Refactored to use dflow
- `lib/arena/hooks/useTrades.ts` - Refactored to use dflow
- `lib/arena/hooks/index.ts` - Updated exports
- `lib/ai/agents/predictionMarketAgent.ts` - Added chat message saving

### Removed Files
- `app/api/arena/portfolios/route.ts`
- `app/api/arena/positions/route.ts`
- `app/api/arena/trades/route.ts`
- `app/api/arena/broadcasts/route.ts`
- `components/broadcast/BroadcastCard.tsx`
- `components/broadcast/BroadcastFeed.tsx`
- `lib/arena/hooks/useBroadcasts.ts`

---

## Testing Recommendations

1. **Wallet Configuration**
   - Add wallet addresses to models in Supabase
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

---

## Next Steps

1. Deploy database migrations to production
2. Configure wallet addresses for each model
3. Set up CRON_SECRET and verify cron job execution
4. Test end-to-end trading flow with real wallets
5. Monitor performance snapshots and adjust cron frequency if needed
