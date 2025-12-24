-- Arena Chat Messages Schema
-- Migration: Create arena_chat_messages table for Model Chat feature
-- Stores UIMessage objects with custom arena metadata as JSONB

-- ============================================================================
-- ARENA CHAT MESSAGES
-- Unified chat messages for models, users, and assistant in arena sessions
-- Uses ai-sdk UIMessage format with parts and metadata as JSONB
-- ============================================================================
CREATE TABLE IF NOT EXISTS arena_chat_messages (
  id TEXT PRIMARY KEY,                                    -- UIMessage.id
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  parts JSONB NOT NULL,                                   -- UIMessage.parts array
  metadata JSONB,                                         -- ArenaChatMetadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup by session with time ordering
CREATE INDEX IF NOT EXISTS idx_arena_chat_session
  ON arena_chat_messages(session_id, created_at ASC);

-- GIN index for metadata queries (filter by authorType, messageType, etc.)
CREATE INDEX IF NOT EXISTS idx_arena_chat_metadata
  ON arena_chat_messages USING GIN (metadata);

-- Partial index for model messages (common filter)
CREATE INDEX IF NOT EXISTS idx_arena_chat_model_messages
  ON arena_chat_messages(session_id, created_at ASC)
  WHERE metadata->>'authorType' = 'model';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE arena_chat_messages ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can view arena chat)
CREATE POLICY "Allow public read access on arena_chat_messages"
  ON arena_chat_messages FOR SELECT USING (true);

-- Service role full access (for API routes to insert/update)
CREATE POLICY "Allow service role full access on arena_chat_messages"
  ON arena_chat_messages FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE arena_chat_messages IS 'Unified chat messages for the Arena Model Chat feature. Stores ai-sdk UIMessage format with custom metadata.';
COMMENT ON COLUMN arena_chat_messages.id IS 'Unique message ID (from ai-sdk UIMessage)';
COMMENT ON COLUMN arena_chat_messages.session_id IS 'Reference to the trading session this message belongs to';
COMMENT ON COLUMN arena_chat_messages.role IS 'Message role: user or assistant (models use assistant role)';
COMMENT ON COLUMN arena_chat_messages.parts IS 'UIMessage parts array (text, images, tool calls, etc.)';
COMMENT ON COLUMN arena_chat_messages.metadata IS 'ArenaChatMetadata: sessionId, authorType, authorId, messageType, relatedTradeId, createdAt';
