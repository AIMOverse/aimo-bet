// ============================================================================
// Wallet Utilities
// Centralized exports for multi-chain wallet management
// ============================================================================

// Registry
export {
  type Chain,
  type SeriesWallets,
  WALLET_REGISTRY,
  getSeriesWallets,
  getWalletForChain,
  hasWalletForChain,
  getAvailableChains,
} from "./registry";

// SVM (Solana) signer
export { createSvmSigner } from "./svm";

// EVM (Polygon) signer
export { createEvmSigner, POLYGON_CHAIN_ID } from "./evm";
