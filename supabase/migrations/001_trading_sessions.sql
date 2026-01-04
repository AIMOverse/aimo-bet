-- ============================================================================
-- Migration: 001_trading_sessions
-- Description: Create trading_sessions table for arena/competition containers
-- ============================================================================

CREATE TABLE IF NOT EXISTS trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'running', 'paused', 'completed')),
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trading_sessions_status ON trading_sessions(status);
CREATE INDEX IF NOT EXISTS idx_trading_sessions_name ON trading_sessions(name);

-- Enable RLS
ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public read, service role write
CREATE POLICY "Public read access" ON trading_sessions
  FOR SELECT USING (true);
