// ============================================================================
// Wallet Registry
// Centralized wallet configuration for all model series
// Supports both SVM (Solana) and EVM (Polygon) chains
// ============================================================================

export type Chain = "svm" | "evm";

export interface SeriesWallets {
  svm?: string; // Solana private key (base58)
  evm?: string; // EVM private key (hex, with or without 0x)
}

/**
 * Wallet registry mapping model series to their chain-specific private keys.
 *
 * Env var naming convention:
 * - SVM: WALLET_{SERIES}_SVM_PRIVATE (Solana, base58 encoded)
 * - EVM: WALLET_{SERIES}_EVM_PRIVATE (Polygon, hex encoded)
 */
export const WALLET_REGISTRY: Record<string, SeriesWallets> = {
  openai: {
    svm: process.env.WALLET_GPT_SVM_PRIVATE,
    evm: process.env.WALLET_GPT_EVM_PRIVATE,
  },
  gpt: {
    svm: process.env.WALLET_GPT_SVM_PRIVATE,
    evm: process.env.WALLET_GPT_EVM_PRIVATE,
  },
  claude: {
    svm: process.env.WALLET_CLAUDE_SVM_PRIVATE,
    evm: process.env.WALLET_CLAUDE_EVM_PRIVATE,
  },
  deepseek: {
    svm: process.env.WALLET_DEEPSEEK_SVM_PRIVATE,
    evm: process.env.WALLET_DEEPSEEK_EVM_PRIVATE,
  },
  glm: {
    svm: process.env.WALLET_GLM_SVM_PRIVATE,
    evm: process.env.WALLET_GLM_EVM_PRIVATE,
  },
  grok: {
    svm: process.env.WALLET_GROK_SVM_PRIVATE,
    evm: process.env.WALLET_GROK_EVM_PRIVATE,
  },
  qwen: {
    svm: process.env.WALLET_QWEN_SVM_PRIVATE,
    evm: process.env.WALLET_QWEN_EVM_PRIVATE,
  },
  gemini: {
    svm: process.env.WALLET_GEMINI_SVM_PRIVATE,
    evm: process.env.WALLET_GEMINI_EVM_PRIVATE,
  },
  kimi: {
    svm: process.env.WALLET_KIMI_SVM_PRIVATE,
    evm: process.env.WALLET_KIMI_EVM_PRIVATE,
  },
};

/**
 * Get wallet configuration for a model series.
 * @param series - Model series name (e.g., "gpt", "claude")
 * @returns Wallet configuration or undefined if not found
 */
export function getSeriesWallets(series: string): SeriesWallets | undefined {
  return WALLET_REGISTRY[series];
}

/**
 * Get a specific chain wallet for a model series.
 * @param series - Model series name
 * @param chain - Target chain ("svm" or "evm")
 * @returns Private key string or undefined
 */
export function getWalletForChain(
  series: string,
  chain: Chain
): string | undefined {
  const wallets = WALLET_REGISTRY[series];
  return wallets?.[chain];
}

/**
 * Check if a series has a wallet configured for a specific chain.
 * @param series - Model series name
 * @param chain - Target chain
 * @returns True if wallet is configured
 */
export function hasWalletForChain(series: string, chain: Chain): boolean {
  const key = getWalletForChain(series, chain);
  return key !== undefined && key.length > 0;
}

/**
 * Get all available chains for a series.
 * @param series - Model series name
 * @returns Array of available chains
 */
export function getAvailableChains(series: string): Chain[] {
  const chains: Chain[] = [];
  if (hasWalletForChain(series, "svm")) chains.push("svm");
  if (hasWalletForChain(series, "evm")) chains.push("evm");
  return chains;
}
