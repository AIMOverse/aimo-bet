-- ============================================================================
-- Agent Trading Schema Migration
-- Creates tables for agent sessions, decisions, and trades
-- ============================================================================

-- ============================================================================
-- Table: trading_sessions
-- Trading competitions/arenas - each session is a distinct competition period
-- ============================================================================

CREATE TABLE IF NOT EXISTS trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup', 'running', 'paused', 'completed')),
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_sessions_status ON trading_sessions(status);

-- ============================================================================
-- Table: agent_sessions
-- Links each AI model to a trading session
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,

  -- Model identification (from catalog.ts)
  model_id TEXT NOT NULL,           -- "openrouter/gpt-4o"
  model_name TEXT NOT NULL,         -- "GPT-4o" (display name)
  wallet_address TEXT NOT NULL,     -- Solana public key

  -- Capital tracking
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  current_value NUMERIC NOT NULL DEFAULT 10000,
  total_pnl NUMERIC NOT NULL DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'eliminated')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(session_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_session ON agent_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_model ON agent_sessions(model_id);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_agent_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_session_timestamp();

-- ============================================================================
-- Table: agent_decisions
-- Every agent trigger creates a decision record
-- Source for both chat feed AND chart time-series
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,

  -- Trigger info
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'price_swing', 'volume_spike', 'orderbook_imbalance', 'periodic', 'manual'
  )),
  trigger_details JSONB,

  -- Market (nullable for portfolio review)
  market_ticker TEXT,
  market_title TEXT,

  -- Decision
  decision TEXT NOT NULL CHECK (decision IN ('buy', 'sell', 'hold', 'skip')),

  -- Reasoning (displayed in chat feed!)
  reasoning TEXT NOT NULL,
  confidence NUMERIC,
  market_context JSONB,

  -- Portfolio value for chart
  portfolio_value_after NUMERIC NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_session ON agent_decisions(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_created ON agent_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_chart ON agent_decisions(agent_session_id, created_at ASC);

-- ============================================================================
-- Table: agent_trades
-- Executed trades (outcome of buy/sell decisions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES agent_decisions(id) ON DELETE CASCADE,
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,

  market_ticker TEXT NOT NULL,
  market_title TEXT,
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  notional NUMERIC NOT NULL,
  tx_signature TEXT,
  pnl NUMERIC,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_trades_decision ON agent_trades(decision_id);
CREATE INDEX IF NOT EXISTS idx_agent_trades_session ON agent_trades(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_trades_created ON agent_trades(created_at DESC);

-- ============================================================================
-- Supabase Realtime Configuration
-- ============================================================================

-- Enable realtime for chat feed + chart
ALTER PUBLICATION supabase_realtime ADD TABLE agent_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_trades ENABLE ROW LEVEL SECURITY;

-- Public read (arena is spectator-friendly)
DROP POLICY IF EXISTS "Public read trading_sessions" ON trading_sessions;
CREATE POLICY "Public read trading_sessions" ON trading_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read agent_sessions" ON agent_sessions;
CREATE POLICY "Public read agent_sessions" ON agent_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read agent_decisions" ON agent_decisions;
CREATE POLICY "Public read agent_decisions" ON agent_decisions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read agent_trades" ON agent_trades;
CREATE POLICY "Public read agent_trades" ON agent_trades FOR SELECT USING (true);

-- Service role write (for API operations)
DROP POLICY IF EXISTS "Service write trading_sessions" ON trading_sessions;
CREATE POLICY "Service write trading_sessions" ON trading_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service write agent_sessions" ON agent_sessions;
CREATE POLICY "Service write agent_sessions" ON agent_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service write agent_decisions" ON agent_decisions;
CREATE POLICY "Service write agent_decisions" ON agent_decisions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service write agent_trades" ON agent_trades;
CREATE POLICY "Service write agent_trades" ON agent_trades FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
