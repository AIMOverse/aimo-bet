# Supabase Migrations

Database migrations for Alpha Arena.

## Structure

```
supabase/
├── migrations/
│   ├── 000_init.sql              # Extensions setup
│   ├── 001_trading_sessions.sql  # Arena containers
│   ├── 002_agent_sessions.sql    # Agent state & portfolio
│   ├── 003_agent_decisions.sql   # Agent decision history
│   ├── 004_agent_trades.sql      # Executed trades
│   ├── 005_arena_chat_messages.sql # User chat messages
│   └── 006_agent_positions.sql   # Agent positions (single source of truth)
├── seed.sql                      # Default data (Global Arena)
└── README.md
```

## Architecture: Supabase as Single Source of Truth

All UI hooks read from Supabase tables, with the trading workflow as the single writer.

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
│  │                 │  │                 │  │                 │  │
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

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent Tools vs UI Hooks | Agent uses dflow API, UI uses Supabase | On-chain truth for trading, recorded data for display |
| USDC Balance | Single RPC call | Accurate, simple, fast (~100ms) |
| Position Updates | Delta-based with atomic upsert | `quantity = current + bought - sold` |
| Redemptions | `action: 'redeem'` | Distinct from sell (market may be resolved) |
| No API Routes | Direct Supabase client + realtime | Consistent pattern, instant updates |

## Running Migrations

### Option 1: Supabase CLI (Recommended)

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Run migrations
supabase db push
```

### Option 2: Manual SQL Editor

Run each migration file in order in the Supabase SQL Editor:

1. Go to your Supabase Dashboard → SQL Editor
2. Copy and paste each migration file content
3. Execute in order: 000, 001, 002, 003, 004, 005, 006
4. Run `seed.sql` to create the Global Arena session

## Tables

### agent_positions (New)

Tracks positions per agent session with delta-based updates.

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
```

### agent_trades

Executed trades linked to decisions. Now supports `redeem` action.

```sql
-- action constraint
CHECK (action IN ('buy', 'sell', 'redeem'))
```

### Database Functions

#### upsert_agent_position

Atomic position update function for delta-based quantity changes.

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
  INSERT INTO agent_positions (...)
  ON CONFLICT (agent_session_id, market_ticker, side)
  DO UPDATE SET
    quantity = agent_positions.quantity + p_quantity_delta,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
```

## Security Model

- **Row Level Security (RLS)**: Enabled on all tables
- **Read Access**: Public (via `anon` key)
- **Write Access**: Restricted to `service_role` key (backend only)

The frontend can read data for display, but all writes go through the backend using `SUPABASE_SERVICE_ROLE_KEY`.

## Realtime

The following tables have Realtime enabled for live updates:

- `agent_sessions` - Leaderboard updates
- `agent_decisions` - Chat feed updates
- `agent_trades` - Trade feed updates
- `agent_positions` - Position updates

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # Public, read-only
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # Server-side only, full access
```
