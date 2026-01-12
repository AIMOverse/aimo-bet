// ============================================================================
// Unified Agent Signers
// Creates all signer types for a model from the wallet registry
// ============================================================================

import type { KeyPairSigner } from "@solana/kit";
import type { Wallet } from "ethers";
import type { SvmClientSigner } from "@aimo.network/svm";

import {
  getSeriesWallets,
  getWalletForChain,
  type Chain,
} from "../wallets/registry";
import { createSvmSigner } from "../wallets/svm";
import { createSignerFromBase58SecretKey } from "../solana/wallets";
import { createPolygonWallet } from "../polygon/client";
import { getModelById } from "@/lib/ai/models/catalog";

// ============================================================================
// Types
// ============================================================================

export interface SvmSigners {
  /** Solana wallet address */
  address: string;
  /** KeyPairSigner for Kalshi trading + bridge source */
  keyPairSigner: KeyPairSigner;
  /** SvmClientSigner for AiMo LLM inference payments */
  aimoSigner: SvmClientSigner;
}

export interface EvmSigners {
  /** EVM EOA wallet address (holds USDC for Polymarket) */
  address: string;
  /** ethers Wallet for Polymarket order signing */
  wallet: Wallet;
}

export interface AgentSigners {
  /** Model series (e.g., "gpt", "claude") */
  series: string;
  /** Full model ID (e.g., "openai/gpt-5") */
  modelId: string;
  /** Solana signers (optional - may not be configured) */
  svm?: SvmSigners;
  /** Polygon signers (optional - may not be configured) */
  evm?: EvmSigners;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get series from model ID using the catalog.
 * Falls back to extracting from model ID prefix.
 */
function getSeriesFromModelId(modelId: string): string {
  const model = getModelById(modelId);
  if (model?.series) {
    return model.series;
  }
  // Fallback: extract provider/org from model ID
  return modelId.split("/")[0];
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create unified agent signers for a model.
 *
 * @param modelId - Full model ID (e.g., "openai/gpt-5", "anthropic/claude-sonnet-4.5")
 * @returns AgentSigners with all available signer types
 * @throws Error if no wallets are configured for the series
 *
 * @example
 * ```typescript
 * const signers = await createAgentSigners("openai/gpt-5");
 *
 * // Use SVM signer for Kalshi trading
 * if (signers.svm) {
 *   await signAndSubmitTransaction(tx, signers.svm.keyPairSigner);
 * }
 *
 * // Use EVM signer for Polymarket (EOA mode)
 * if (signers.evm) {
 *   const clobClient = await createClobClient(signers.evm.wallet);
 *   // Funds held in signers.evm.address (EOA wallet)
 * }
 * ```
 */
export async function createAgentSigners(
  modelId: string
): Promise<AgentSigners> {
  const series = getSeriesFromModelId(modelId);
  const wallets = getSeriesWallets(series);

  if (!wallets) {
    throw new Error(
      `No wallets configured for series "${series}" (modelId: ${modelId})`
    );
  }

  const result: AgentSigners = {
    series,
    modelId,
  };

  // Create SVM signers if private key is available
  const svmPrivateKey = wallets.svm;
  if (svmPrivateKey) {
    const keyPairSigner = await createSignerFromBase58SecretKey(svmPrivateKey);
    const aimoSigner = await createSvmSigner(svmPrivateKey);

    result.svm = {
      address: keyPairSigner.address,
      keyPairSigner,
      aimoSigner,
    };
  }

  // Create EVM signers if private key is available
  const evmPrivateKey = wallets.evm;
  if (evmPrivateKey) {
    const wallet = createPolygonWallet(evmPrivateKey);

    result.evm = {
      address: wallet.address,
      wallet,
    };
  }

  console.log(
    `[AgentSigners] Created signers for ${modelId} (series: ${series}):`,
    {
      hasSvm: !!result.svm,
      svmAddress: result.svm?.address,
      hasEvm: !!result.evm,
      evmAddress: result.evm?.address,
    }
  );

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a model has signers available for a specific chain.
 */
export function hasSignersForChain(modelId: string, chain: Chain): boolean {
  const series = getSeriesFromModelId(modelId);
  const key = getWalletForChain(series, chain);
  return key !== undefined && key.length > 0;
}

/**
 * Check if a model has Polymarket support (EVM wallet configured).
 */
export function hasPolymarketSupport(modelId: string): boolean {
  const series = getSeriesFromModelId(modelId);
  const wallets = getSeriesWallets(series);
  return !!wallets?.evm;
}

/**
 * Get the series for a given model ID.
 * Useful for external modules that need series info without creating signers.
 */
export function getSeriesForModel(modelId: string): string {
  return getSeriesFromModelId(modelId);
}
