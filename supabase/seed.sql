-- ============================================================================
-- Seed Data: Create Global Arena session
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
