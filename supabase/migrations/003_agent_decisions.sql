-- ============================================================================
-- Migration: 003_agent_decisions
-- Description: Create agent_decisions table for recording every agent trigger
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('price_swing', 'volume_spike', 'orderbook_imbalance', 'periodic', 'manual')),
  trigger_details JSONB,
  market_ticker TEXT,
  market_title TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('buy', 'sell', 'hold', 'skip')),
  reasoning TEXT NOT NULL,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  market_context JSONB,
  portfolio_value_after NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_decisions_session ON agent_decisions(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_created ON agent_decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_session_time ON agent_decisions(agent_session_id, created_at);

-- Enable RLS
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public read, service role write
CREATE POLICY "Public read access" ON agent_decisions
  FOR SELECT USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_decisions;
