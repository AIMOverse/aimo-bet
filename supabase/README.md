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
│   └── 005_arena_chat_messages.sql # User chat messages
├── seed.sql                      # Default data (Global Arena)
└── README.md
```

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
3. Execute in order: 000, 001, 002, 003, 004, 005
4. Run `seed.sql` to create the Global Arena session

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

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # Public, read-only
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # Server-side only, full access
```
