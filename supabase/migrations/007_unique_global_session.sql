-- ============================================================================
-- Migration: 007_consolidate_global_session
-- Description: Consolidate all data into a single Global Arena session
--
-- This migration:
-- 1. Picks the oldest session as the canonical one (or creates one with fixed UUID)
-- 2. Merges agent_sessions per model_id into the canonical session
-- 3. Re-links all child records to the merged agent sessions
-- 4. Deletes duplicate sessions
-- 5. Adds unique constraint to prevent future duplicates
-- ============================================================================

-- Use a fixed UUID for the global session
DO $$
DECLARE
  canonical_session_id UUID := '00000000-0000-0000-0000-000000000001';
  model_rec RECORD;
  pos_rec RECORD;
  canonical_agent_id UUID;
  total_pnl_sum NUMERIC;
  latest_value NUMERIC;
  current_model_id TEXT;
BEGIN
  -- ========================================================================
  -- Step 0: Create canonical session if it doesn't exist
  -- ========================================================================
  INSERT INTO trading_sessions (id, name, status, starting_capital, started_at, created_at)
  VALUES (
    canonical_session_id,
    'Global Arena',
    'running',
    10000,
    COALESCE(
      (SELECT MIN(started_at) FROM trading_sessions WHERE started_at IS NOT NULL),
      NOW()
    ),
    COALESCE(
      (SELECT MIN(created_at) FROM trading_sessions),
      NOW()
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    name = 'Global Arena',
    status = 'running';

  RAISE NOTICE 'Canonical session: %', canonical_session_id;

  -- ========================================================================
  -- Step 1: For each model_id, merge all agent_sessions into one
  -- ========================================================================
  FOR model_rec IN 
    SELECT DISTINCT model_id, model_name, wallet_address
    FROM agent_sessions
  LOOP
    current_model_id := model_rec.model_id;
    RAISE NOTICE 'Processing model: %', current_model_id;

    -- Check if canonical agent session already exists
    SELECT id INTO canonical_agent_id
    FROM agent_sessions
    WHERE session_id = canonical_session_id AND model_id = current_model_id;

    IF canonical_agent_id IS NULL THEN
      -- Find the oldest agent session for this model to use as base
      SELECT id INTO canonical_agent_id
      FROM agent_sessions
      WHERE model_id = current_model_id
      ORDER BY created_at ASC
      LIMIT 1;

      -- Update it to point to canonical session
      UPDATE agent_sessions
      SET session_id = canonical_session_id
      WHERE id = canonical_agent_id;

      RAISE NOTICE '  Moved agent session % to canonical', canonical_agent_id;
    END IF;

    -- Calculate aggregated values from all sessions for this model
    SELECT 
      COALESCE(SUM(total_pnl), 0),
      COALESCE(
        (SELECT current_value FROM agent_sessions 
         WHERE model_id = current_model_id 
         ORDER BY updated_at DESC LIMIT 1),
        10000
      )
    INTO total_pnl_sum, latest_value
    FROM agent_sessions
    WHERE model_id = current_model_id;

    -- Update canonical agent session with aggregated values
    UPDATE agent_sessions
    SET 
      current_value = latest_value,
      total_pnl = total_pnl_sum,
      updated_at = NOW()
    WHERE id = canonical_agent_id;

    -- Re-link all agent_decisions from other sessions to canonical
    UPDATE agent_decisions
    SET agent_session_id = canonical_agent_id
    WHERE agent_session_id IN (
      SELECT id FROM agent_sessions 
      WHERE model_id = current_model_id AND id != canonical_agent_id
    );

    -- Re-link all agent_trades from other sessions to canonical
    UPDATE agent_trades
    SET agent_session_id = canonical_agent_id
    WHERE agent_session_id IN (
      SELECT id FROM agent_sessions 
      WHERE model_id = current_model_id AND id != canonical_agent_id
    );

    -- Merge agent_positions: aggregate by ticker/side
    -- Note: positions have UNIQUE(agent_session_id, market_ticker, side)
    FOR pos_rec IN
      SELECT market_ticker, side, 
             SUM(quantity) as total_qty,
             MAX(updated_at) as last_updated,
             MAX(mint) as mint_val
      FROM agent_positions
      WHERE agent_session_id IN (
        SELECT id FROM agent_sessions WHERE model_id = current_model_id
      )
      GROUP BY market_ticker, side
    LOOP
      -- Delete all positions for this ticker/side across all agent sessions for this model
      DELETE FROM agent_positions
      WHERE agent_session_id IN (
        SELECT id FROM agent_sessions WHERE model_id = current_model_id
      )
      AND market_ticker = pos_rec.market_ticker AND side = pos_rec.side;

      -- Insert merged position if quantity > 0
      IF pos_rec.total_qty > 0 THEN
        INSERT INTO agent_positions (agent_session_id, market_ticker, side, mint, quantity, updated_at)
        VALUES (canonical_agent_id, pos_rec.market_ticker, pos_rec.side, COALESCE(pos_rec.mint_val, ''), pos_rec.total_qty, pos_rec.last_updated);
      END IF;
    END LOOP;

    -- Delete duplicate agent sessions (keep only canonical)
    DELETE FROM agent_sessions
    WHERE model_id = current_model_id AND id != canonical_agent_id;

    RAISE NOTICE '  Consolidated into agent session %', canonical_agent_id;
  END LOOP;

  -- ========================================================================
  -- Step 2: Re-link arena_chat_messages to canonical session
  -- ========================================================================
  UPDATE arena_chat_messages
  SET session_id = canonical_session_id
  WHERE session_id != canonical_session_id;

  -- ========================================================================
  -- Step 3: Delete all other trading sessions
  -- ========================================================================
  DELETE FROM trading_sessions
  WHERE id != canonical_session_id;

  RAISE NOTICE 'Migration complete. All data consolidated into session %', canonical_session_id;
END $$;

-- ============================================================================
-- Step 4: Add unique constraint to prevent future duplicates
-- ============================================================================

-- Only one "Global Arena" session can be "running" at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_sessions_global_arena_running 
ON trading_sessions (name) 
WHERE name = 'Global Arena' AND status = 'running';

-- Ensure agent_sessions unique constraint exists
-- (should already exist from migration 002, but be safe)
DROP INDEX IF EXISTS idx_agent_sessions_unique;
CREATE UNIQUE INDEX idx_agent_sessions_unique ON agent_sessions(session_id, model_id);
