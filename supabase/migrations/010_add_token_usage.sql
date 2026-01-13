-- ============================================================================
-- Migration: 010_add_token_usage
-- Description: Add total_tokens column to agent_sessions for tracking LLM usage
-- ============================================================================

-- Add total_tokens column to track cumulative token consumption per agent
ALTER TABLE agent_sessions
ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0;

-- Create function to atomically increment token usage
CREATE OR REPLACE FUNCTION increment_agent_tokens(
  p_session_id UUID,
  p_tokens BIGINT
) RETURNS VOID AS $$
BEGIN
  UPDATE agent_sessions
  SET total_tokens = total_tokens + p_tokens,
      updated_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;
