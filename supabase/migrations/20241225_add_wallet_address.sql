-- ============================================================================
-- Add wallet_address column to arena_models for on-chain trading
-- ============================================================================

-- Add wallet_address column to arena_models (public address only)
ALTER TABLE arena_models
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Add comment for documentation
COMMENT ON COLUMN arena_models.wallet_address IS 'Public Solana wallet address for on-chain trading. Private keys stored in env vars.';

-- Create index for wallet address lookups
CREATE INDEX IF NOT EXISTS idx_arena_models_wallet_address
ON arena_models(wallet_address)
WHERE wallet_address IS NOT NULL;
