-- Alpha Arena Database Schema
-- Migration: Create arena tables for LLM prediction market trading platform

-- ============================================================================
-- ARENA MODELS
-- Dynamic registry of LLM models participating in the arena
-- ============================================================================
CREATE TABLE IF NOT EXISTS arena_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model_identifier VARCHAR(200) NOT NULL,
  avatar_url TEXT,
  chart_color VARCHAR(20) DEFAULT '#6366f1',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_model_identifier UNIQUE (model_identifier)
);

-- ============================================================================
-- TRADING SESSIONS
-- One active session at a time where models compete
-- ============================================================================
CREATE TABLE IF NOT EXISTS trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200),
  status VARCHAR(20) DEFAULT 'setup' CHECK (status IN ('setup', 'running', 'paused', 'completed')),
  starting_capital DECIMAL(20, 2) DEFAULT 10000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MODEL PORTFOLIOS
-- Each model has a portfolio per session tracking their cash balance
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES arena_models(id) ON DELETE CASCADE,
  cash_balance DECIMAL(20, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_session_model UNIQUE (session_id, model_id)
);

-- ============================================================================
-- POSITIONS
-- Open positions in prediction markets
-- ============================================================================
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES model_portfolios(id) ON DELETE CASCADE,
  market_ticker VARCHAR(100) NOT NULL,
  market_title TEXT,
  side VARCHAR(10) NOT NULL CHECK (side IN ('yes', 'no')),
  quantity DECIMAL(20, 4) NOT NULL,
  avg_entry_price DECIMAL(10, 4) NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,

  -- Index for finding open positions
  CONSTRAINT check_closed_timestamp CHECK (
    (status = 'open' AND closed_at IS NULL) OR
    (status = 'closed' AND closed_at IS NOT NULL)
  )
);

-- ============================================================================
-- TRADES
-- Record of all trades executed by models
-- ============================================================================
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES model_portfolios(id) ON DELETE CASCADE,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  market_ticker VARCHAR(100) NOT NULL,
  market_title TEXT,
  side VARCHAR(10) NOT NULL CHECK (side IN ('yes', 'no')),
  action VARCHAR(10) NOT NULL CHECK (action IN ('buy', 'sell')),
  quantity DECIMAL(20, 4) NOT NULL,
  price DECIMAL(10, 4) NOT NULL,
  notional DECIMAL(20, 2) NOT NULL,
  pnl DECIMAL(20, 2),
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE SNAPSHOTS
-- Time-series data for performance charts
-- ============================================================================
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES arena_models(id) ON DELETE CASCADE,
  account_value DECIMAL(20, 2) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BROADCASTS
-- Model reasoning and commentary shared during trading
-- ============================================================================
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES arena_models(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('analysis', 'trade', 'commentary')),
  content TEXT NOT NULL,
  related_trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Performance snapshots: fast lookup by session and time
CREATE INDEX IF NOT EXISTS idx_snapshots_session_time
  ON performance_snapshots(session_id, timestamp DESC);

-- Performance snapshots: fast lookup by model
CREATE INDEX IF NOT EXISTS idx_snapshots_model
  ON performance_snapshots(model_id, timestamp DESC);

-- Trades: fast lookup by portfolio with time ordering
CREATE INDEX IF NOT EXISTS idx_trades_portfolio_time
  ON trades(portfolio_id, created_at DESC);

-- Trades: fast lookup by market ticker
CREATE INDEX IF NOT EXISTS idx_trades_market
  ON trades(market_ticker, created_at DESC);

-- Broadcasts: fast lookup by session with time ordering
CREATE INDEX IF NOT EXISTS idx_broadcasts_session_time
  ON broadcasts(session_id, created_at DESC);

-- Broadcasts: fast lookup by model
CREATE INDEX IF NOT EXISTS idx_broadcasts_model
  ON broadcasts(model_id, created_at DESC);

-- Positions: find open positions by portfolio
CREATE INDEX IF NOT EXISTS idx_positions_portfolio_status
  ON positions(portfolio_id, status) WHERE status = 'open';

-- Arena models: fast lookup by enabled status
CREATE INDEX IF NOT EXISTS idx_models_enabled
  ON arena_models(enabled) WHERE enabled = true;

-- ============================================================================
-- TRIGGERS FOR updated_at
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for arena_models
DROP TRIGGER IF EXISTS update_arena_models_updated_at ON arena_models;
CREATE TRIGGER update_arena_models_updated_at
  BEFORE UPDATE ON arena_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for trading_sessions
DROP TRIGGER IF EXISTS update_trading_sessions_updated_at ON trading_sessions;
CREATE TRIGGER update_trading_sessions_updated_at
  BEFORE UPDATE ON trading_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for model_portfolios
DROP TRIGGER IF EXISTS update_model_portfolios_updated_at ON model_portfolios;
CREATE TRIGGER update_model_portfolios_updated_at
  BEFORE UPDATE ON model_portfolios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA: Pre-populate with default arena models
-- ============================================================================

INSERT INTO arena_models (name, provider, model_identifier, chart_color, enabled)
VALUES
  ('GPT-4o', 'OpenRouter', 'openai/gpt-4o', '#10b981', true),
  ('GPT-4o Mini', 'OpenRouter', 'openai/gpt-4o-mini', '#22c55e', true),
  ('Claude Sonnet 4', 'OpenRouter', 'anthropic/claude-sonnet-4', '#f97316', true),
  ('Claude 3.5 Haiku', 'OpenRouter', 'anthropic/claude-3.5-haiku', '#fb923c', true),
  ('Gemini 2.0 Flash', 'OpenRouter', 'google/gemini-2.0-flash-001', '#3b82f6', true),
  ('DeepSeek Chat', 'OpenRouter', 'deepseek/deepseek-chat', '#8b5cf6', true),
  ('Llama 3.3 70B', 'OpenRouter', 'meta-llama/llama-3.3-70b-instruct', '#ec4899', true),
  ('Mistral Large', 'OpenRouter', 'mistralai/mistral-large-2411', '#06b6d4', true)
ON CONFLICT (model_identifier) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS but allow public access for now (adjust based on auth requirements)
-- ============================================================================

ALTER TABLE arena_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

-- Public read access policies
CREATE POLICY "Allow public read access on arena_models"
  ON arena_models FOR SELECT USING (true);

CREATE POLICY "Allow public read access on trading_sessions"
  ON trading_sessions FOR SELECT USING (true);

CREATE POLICY "Allow public read access on model_portfolios"
  ON model_portfolios FOR SELECT USING (true);

CREATE POLICY "Allow public read access on positions"
  ON positions FOR SELECT USING (true);

CREATE POLICY "Allow public read access on trades"
  ON trades FOR SELECT USING (true);

CREATE POLICY "Allow public read access on performance_snapshots"
  ON performance_snapshots FOR SELECT USING (true);

CREATE POLICY "Allow public read access on broadcasts"
  ON broadcasts FOR SELECT USING (true);

-- Service role insert/update/delete policies (for API routes)
CREATE POLICY "Allow service role full access on arena_models"
  ON arena_models FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access on trading_sessions"
  ON trading_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access on model_portfolios"
  ON model_portfolios FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access on positions"
  ON positions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access on trades"
  ON trades FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access on performance_snapshots"
  ON performance_snapshots FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access on broadcasts"
  ON broadcasts FOR ALL USING (true) WITH CHECK (true);
