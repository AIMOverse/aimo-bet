-- ============================================================================
-- Migration: 009_add_platform_to_agent_trades
-- Description: Add platform column to track trades on kalshi vs polymarket
-- ============================================================================

ALTER TABLE agent_trades
  ADD COLUMN platform TEXT NOT NULL DEFAULT 'kalshi'
  CHECK (platform IN ('kalshi', 'polymarket'));

CREATE INDEX IF NOT EXISTS idx_agent_trades_platform ON agent_trades(platform);

-- Backfill existing trades to kalshi (conservative default)
UPDATE agent_trades
SET platform = 'kalshi'
WHERE platform IS NULL;
