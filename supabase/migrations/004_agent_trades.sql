-- ============================================================================
-- Migration: 004_agent_trades
-- Description: Create agent_trades table for executed trades linked to decisions
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_trades_decision ON agent_trades(decision_id);
CREATE INDEX IF NOT EXISTS idx_agent_trades_session ON agent_trades(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_trades_created ON agent_trades(created_at);

-- Enable RLS
ALTER TABLE agent_trades ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public read, service role write
CREATE POLICY "Public read access" ON agent_trades
  FOR SELECT USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_trades;
