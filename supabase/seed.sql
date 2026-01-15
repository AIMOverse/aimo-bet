-- ============================================================================
-- Seed Data: Create Global Arena session + Agent Sessions
-- ============================================================================

-- Insert the default "Global Arena" session if it doesn't exist
-- Note: Migration 007 also creates this, but seed ensures it exists for fresh DBs
INSERT INTO trading_sessions (id, name, status, starting_capital, started_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Global Arena',
  'running',
  100,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = 'Global Arena',
  status = 'running',
  starting_capital = 100;

-- ============================================================================
-- Seed Agent Sessions: Pre-create sessions for all arena models
-- This ensures models appear on the chart before any agent runs.
-- Wallet addresses are placeholders - actual addresses come from env vars at runtime.
-- Models without wallet env vars won't be triggered but will still show on chart.
-- ============================================================================

INSERT INTO agent_sessions (
  session_id,
  model_id,
  model_name,
  wallet_address,
  starting_capital,
  current_value,
  total_pnl,
  status
) VALUES
  -- GPT-5.2
  (
    '00000000-0000-0000-0000-000000000001',
    'openai/gpt-5.2',
    'GPT 5.2',
    'seed-wallet-gpt',
    100,
    100,
    0,
    'active'
  ),
  -- Claude Sonnet 4.5
  (
    '00000000-0000-0000-0000-000000000001',
    'anthropic/claude-sonnet-4.5',
    'Claude Sonnet 4.5',
    'seed-wallet-claude',
    100,
    100,
    0,
    'active'
  ),
  -- DeepSeek V3.2
  (
    '00000000-0000-0000-0000-000000000001',
    'deepseek/deepseek-v3.2',
    'DeepSeek V3.2',
    'seed-wallet-deepseek',
    100,
    100,
    0,
    'active'
  ),
  -- GLM-4.7
  (
    '00000000-0000-0000-0000-000000000001',
    'z-ai/glm-4.7',
    'GLM 4.7',
    'seed-wallet-glm',
    100,
    100,
    0,
    'active'
  ),
  -- Grok 4.1
  (
    '00000000-0000-0000-0000-000000000001',
    'xai/grok-4.1',
    'Grok 4.1',
    'seed-wallet-grok',
    100,
    100,
    0,
    'active'
  ),
  -- Qwen 3 Max
  (
    '00000000-0000-0000-0000-000000000001',
    'qwen/qwen3-max',
    'Qwen 3 Max',
    'seed-wallet-qwen',
    100,
    100,
    0,
    'active'
  ),
  -- Gemini 3 Pro
  (
    '00000000-0000-0000-0000-000000000001',
    'google/gemini-3-pro',
    'Gemini 3 Pro',
    'seed-wallet-gemini',
    100,
    100,
    0,
    'active'
  ),
  -- Kimi K2
  (
    '00000000-0000-0000-0000-000000000001',
    'moonshotai/kimi-k2-0905',
    'Kimi K2',
    'seed-wallet-kimi',
    100,
    100,
    0,
    'active'
  )
ON CONFLICT (session_id, model_id) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  status = 'active';
