import { aimoNetwork } from "@aimo.network/provider";
import {
  type Chain,
  getWalletForChain,
  getSeriesWallets,
} from "@/lib/crypto/wallets/registry";
import { createSvmSigner } from "@/lib/crypto/wallets/svm";
import { createEvmSigner } from "@/lib/crypto/wallets/evm";
import { getModelById } from "../catalog";

const AIMO_BASE_URL = "https://beta.aimo.network";

/**
 * Cache of initialized providers per series and chain.
 * Key format: "{series}:{chain}" (e.g., "gpt:svm", "claude:evm")
 */
const providerCache = new Map<string, ReturnType<typeof aimoNetwork>>();

/**
 * Create an AiMo Network provider with an SVM (Solana) wallet.
 */
async function createSvmProvider(privateKeyBase58: string) {
  const signer = await createSvmSigner(privateKeyBase58);
  return aimoNetwork({
    signer,
    baseURL: AIMO_BASE_URL,
  });
}

/**
 * Create an AiMo Network provider with an EVM (Polygon) wallet.
 */
function createEvmProvider(privateKeyHex: string) {
  const signer = createEvmSigner(privateKeyHex);
  return aimoNetwork({
    signer,
    baseURL: AIMO_BASE_URL,
  });
}

/**
 * Get series from model ID.
 * Uses the model catalog to get the correct series name, with fallback to extracting from model ID.
 * e.g., "xai/grok-4" -> series: "grok" (from catalog)
 * e.g., "openai/gpt-5.2" -> series: "openai" (from catalog or fallback)
 */
function getSeriesFromModelId(modelId: string): string {
  // First try to get series from the model catalog
  const model = getModelById(modelId);
  if (model?.series) {
    return model.series;
  }
  // Fallback to extracting from model ID prefix
  return modelId.split("/")[0];
}

/**
 * Get an AiMo provider for a specific model and chain.
 * Each model uses its own wallet for API payments.
 *
 * @param modelId - Provider-specific model ID (e.g., "openai/gpt-5")
 * @param canonicalId - Canonical model ID for catalog lookup (e.g., "openai/gpt-5")
 * @param chain - Payment chain to use ("svm" for Solana, "evm" for Polygon)
 * @returns AiMo provider configured with the model's wallet for the specified chain
 */
export async function getAimoProvider(
  modelId: string,
  canonicalId: string = modelId,
  chain: Chain = "svm",
) {
  const series = getSeriesFromModelId(canonicalId);
  const cacheKey = `${series}:${chain}`;

  console.log(
    `[AimoProvider] Getting provider for modelId="${modelId}", canonicalId="${canonicalId}", series="${series}", chain="${chain}"`,
  );

  // Return cached provider if available
  const cached = providerCache.get(cacheKey);
  if (cached) {
    console.log(
      `[AimoProvider] Using cached provider for series="${series}", chain="${chain}"`,
    );
    return cached;
  }

  // Get wallet for this series and chain
  const privateKey = getWalletForChain(series, chain);
  if (!privateKey) {
    const envVarName = `WALLET_${series.toUpperCase()}_${chain.toUpperCase()}_PRIVATE`;
    const error = `No ${chain.toUpperCase()} wallet configured for model series "${series}". Set ${envVarName} environment variable.`;
    console.error(`[AimoProvider] ${error}`);
    throw new Error(error);
  }

  console.log(
    `[AimoProvider] Creating new provider for series="${series}", chain="${chain}"`,
  );

  // Create provider based on chain type
  let provider: ReturnType<typeof aimoNetwork>;
  if (chain === "evm") {
    provider = createEvmProvider(privateKey);
  } else {
    provider = await createSvmProvider(privateKey);
  }

  // Cache and return the provider
  providerCache.set(cacheKey, provider);
  return provider;
}

/**
 * Get a language model from AiMo Network.
 * Uses the model's own wallet for API payments.
 *
 * @param modelId - Provider-specific model ID (e.g., "openai/gpt-5")
 * @param canonicalId - Canonical model ID for catalog lookup (defaults to modelId)
 * @param chain - Payment chain to use ("svm" for Solana, "evm" for Polygon)
 * @returns Language model instance
 */
export async function getAimoModel(
  modelId: string,
  canonicalId: string = modelId,
  chain: Chain = "svm",
) {
  // Resolve the actual provider model ID from the catalog if available
  // This handles mapping internal IDs (e.g. "qwen/qwen3-max") to provider IDs (e.g. "qwen/qwen3-235b-a22b")
  const model = getModelById(canonicalId);
  const providerModelId = model?.providerIds?.aimo || modelId;

  console.log(
    `[AimoProvider] getAimoModel: modelId="${modelId}", canonicalId="${canonicalId}", resolved="${providerModelId}", chain="${chain}"`,
  );

  const provider = await getAimoProvider(providerModelId, canonicalId, chain);
  return provider.chat(providerModelId);
}

/**
 * Check if a model series has a wallet configured for a specific chain.
 * Useful for determining available payment options.
 *
 * @param modelId - Model ID to check
 * @param chain - Chain to check for
 * @returns True if wallet is configured
 */
export function hasWalletForModel(modelId: string, chain: Chain): boolean {
  const series = getSeriesFromModelId(modelId);
  const wallets = getSeriesWallets(series);
  const key = wallets?.[chain];
  return key !== undefined && key.length > 0;
}

// Re-export Chain type for convenience
export type { Chain } from "@/lib/crypto/wallets/registry";
