-- Migration: Create library_files table and storage bucket
-- Description: Sets up the library file management system

-- =============================================================================
-- Create library_files table
-- =============================================================================

CREATE TABLE IF NOT EXISTS library_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('chat', 'generated', 'uploaded')),
  source_id UUID,
  category TEXT NOT NULL CHECK (category IN ('image', 'document', 'code', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_library_files_category ON library_files(category);
CREATE INDEX IF NOT EXISTS idx_library_files_source_type ON library_files(source_type);
CREATE INDEX IF NOT EXISTS idx_library_files_created_at ON library_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_files_name ON library_files(name);

-- =============================================================================
-- Create storage bucket
-- =============================================================================

-- Note: Run this in Supabase SQL Editor or via Supabase Dashboard
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('library', 'library', false)
-- ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- RLS Policies (Optional - for multi-user scenarios)
-- =============================================================================

-- For anonymous usage (current mode), RLS is disabled
-- ALTER TABLE library_files ENABLE ROW LEVEL SECURITY;

-- If you want to enable RLS later for multi-user:
-- CREATE POLICY "Allow all operations" ON library_files
--   FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- Storage Policies
-- =============================================================================

-- Note: Run these in Supabase Dashboard > Storage > Policies
-- Or via SQL:

-- Allow uploads
-- CREATE POLICY "Allow uploads" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'library');

-- Allow downloads
-- CREATE POLICY "Allow downloads" ON storage.objects
--   FOR SELECT USING (bucket_id = 'library');

-- Allow deletes
-- CREATE POLICY "Allow deletes" ON storage.objects
--   FOR DELETE USING (bucket_id = 'library');
