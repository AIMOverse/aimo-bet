-- ============================================================================
-- Migration: 006_agent_positions
-- Description: Create agent_positions table for tracking positions per agent
--              Also adds 'redeem' to agent_trades.action constraint
-- ============================================================================

-- Create agent_positions table
CREATE TABLE IF NOT EXISTS agent_positions (
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

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_agent_positions_session ON agent_positions(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_positions_ticker ON agent_positions(market_ticker);
CREATE INDEX IF NOT EXISTS idx_agent_positions_updated ON agent_positions(updated_at);

-- Enable RLS
ALTER TABLE agent_positions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public read, service role write
CREATE POLICY "Public read access" ON agent_positions
  FOR SELECT USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_positions;

-- ============================================================================
-- Update agent_trades.action constraint to include 'redeem'
-- ============================================================================

-- Drop existing constraint and add updated one
ALTER TABLE agent_trades
  DROP CONSTRAINT IF EXISTS agent_trades_action_check;

ALTER TABLE agent_trades
  ADD CONSTRAINT agent_trades_action_check
    CHECK (action IN ('buy', 'sell', 'redeem'));

-- ============================================================================
-- Database function for atomic position upsert
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_agent_position(
  p_agent_session_id UUID,
  p_market_ticker TEXT,
  p_market_title TEXT,
  p_side TEXT,
  p_mint TEXT,
  p_quantity_delta NUMERIC
) RETURNS VOID AS $$
BEGIN
  INSERT INTO agent_positions (
    agent_session_id, market_ticker, market_title, side, mint, quantity
  ) VALUES (
    p_agent_session_id, p_market_ticker, p_market_title, p_side, p_mint, p_quantity_delta
  )
  ON CONFLICT (agent_session_id, market_ticker, side)
  DO UPDATE SET
    quantity = agent_positions.quantity + p_quantity_delta,
    market_title = COALESCE(p_market_title, agent_positions.market_title),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
