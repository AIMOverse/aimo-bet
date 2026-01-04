-- ============================================================================
-- Migration: 005_arena_chat_messages
-- Description: Create arena_chat_messages table for user chat messages
-- Note: Agent messages are stored in agent_decisions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS arena_chat_messages (
  id TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  parts JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_arena_chat_messages_session ON arena_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_arena_chat_messages_created ON arena_chat_messages(session_id, created_at);

-- Enable RLS
ALTER TABLE arena_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public read, service role write
CREATE POLICY "Public read access" ON arena_chat_messages
  FOR SELECT USING (true);
