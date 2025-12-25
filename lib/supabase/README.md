# Supabase Database Setup

Run the following SQL in the Supabase SQL Editor to create the required tables.

## Create Tables

```sql
-- ============================================================================
-- TRADING SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'running', 'paused', 'completed')),
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for finding active/running sessions
CREATE INDEX IF NOT EXISTS idx_trading_sessions_status ON trading_sessions(status);
CREATE INDEX IF NOT EXISTS idx_trading_sessions_name_status ON trading_sessions(name, status);

-- ============================================================================
-- PERFORMANCE SNAPSHOTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  account_value NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for querying snapshots
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_session_id ON performance_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_timestamp ON performance_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_session_timestamp ON performance_snapshots(session_id, timestamp);

-- ============================================================================
-- ARENA CHAT MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS arena_chat_messages (
  id TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  parts JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for querying messages
CREATE INDEX IF NOT EXISTS idx_arena_chat_messages_session_id ON arena_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_arena_chat_messages_created_at ON arena_chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_arena_chat_messages_session_created ON arena_chat_messages(session_id, created_at);
```

## Enable Row Level Security (Optional)

If you want to enable RLS for these tables:

```sql
-- Enable RLS
ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (adjust as needed)
CREATE POLICY "Allow all for authenticated" ON trading_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON performance_snapshots
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON arena_chat_messages
  FOR ALL USING (true) WITH CHECK (true);
```

## Drop Deprecated Tables (if migrating)

If you're migrating from the old schema, run this to clean up deprecated tables:

```sql
-- Drop deprecated tables (from old schema)
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS library_files CASCADE;

-- Drop library storage bucket (run in Supabase dashboard or via API)
-- DELETE FROM storage.buckets WHERE id = 'library';
```
