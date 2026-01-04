-- ============================================================================
-- Seed Data: Create Global Arena session
-- ============================================================================

-- Insert the default "Global Arena" session if it doesn't exist
INSERT INTO trading_sessions (id, name, status, starting_capital, started_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Global Arena',
  'running',
  10000,
  NOW()
)
ON CONFLICT (id) DO NOTHING;
