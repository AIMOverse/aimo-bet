-- ============================================================================
-- Migration: 008_research_results
-- Description: Create research_results table for storing Parallel Task API results
--              Used for async research webhook delivery and audit trail
-- ============================================================================

-- Create research_results table
CREATE TABLE IF NOT EXISTS research_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  content TEXT,
  basis JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_research_results_run_id ON research_results(run_id);
CREATE INDEX IF NOT EXISTS idx_research_results_status ON research_results(status);
CREATE INDEX IF NOT EXISTS idx_research_results_created ON research_results(created_at);

-- Enable RLS
ALTER TABLE research_results ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public read access (research results are not sensitive)
CREATE POLICY "Public read access" ON research_results
  FOR SELECT USING (true);

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE research_results;

-- ============================================================================
-- Comment on table and columns for documentation
-- ============================================================================

COMMENT ON TABLE research_results IS 'Stores async research results from Parallel Task API';
COMMENT ON COLUMN research_results.run_id IS 'Unique task run ID from Parallel API';
COMMENT ON COLUMN research_results.status IS 'Task status: pending, completed, or failed';
COMMENT ON COLUMN research_results.content IS 'Markdown research report content';
COMMENT ON COLUMN research_results.basis IS 'JSON array of field bases with citations and confidence';
COMMENT ON COLUMN research_results.error IS 'Error message if task failed';
COMMENT ON COLUMN research_results.completed_at IS 'Timestamp when task completed (via webhook)';
