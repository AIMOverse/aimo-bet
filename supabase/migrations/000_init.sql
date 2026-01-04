-- ============================================================================
-- Migration: 000_init
-- Description: Initialize database extensions and settings
-- ============================================================================

-- Enable UUID extension (usually enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_cron for scheduled jobs (optional, requires Supabase Pro)
-- CREATE EXTENSION IF NOT EXISTS "pg_cron";
