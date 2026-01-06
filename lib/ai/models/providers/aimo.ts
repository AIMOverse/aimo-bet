import { SOLANA_RPC_URL } from "@/lib/config";
import { aimoNetwork } from "@aimo.network/provider";
import { SvmClientSigner, SOLANA_MAINNET_CHAIN_ID } from "@aimo.network/svm";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";
import { getModelById } from "../catalog";

const AIMO_BASE_URL = "https://beta.aimo.network";

/**
 * Wallet private key mapping by model series.
 * The series name is defined in the model catalog, not extracted from the model ID.
 * Maps series name -> env var name (e.g., openai series uses WALLET_GPT_PRIVATE)
 */
const WALLET_PRIVATE_KEYS: Record<string, string | undefined> = {
  openai: process.env.WALLET_GPT_PRIVATE,
  gpt: process.env.WALLET_GPT_PRIVATE,
  claude: process.env.WALLET_CLAUDE_PRIVATE,
  deepseek: process.env.WALLET_DEEPSEEK_PRIVATE,
  glm: process.env.WALLET_GLM_PRIVATE,
  grok: process.env.WALLET_GROK_PRIVATE,
  qwen: process.env.WALLET_QWEN_PRIVATE,
  gemini: process.env.WALLET_GEMINI_PRIVATE,
  kimi: process.env.WALLET_KIMI_PRIVATE,
};

/**
 * Cache of initialized providers per series.
 */
const providerCache = new Map<string, ReturnType<typeof aimoNetwork>>();

/**
 * Create an AiMo Network provider with the specified wallet.
 */
async function createProviderWithWallet(privateKeyBase58: string) {
  const encoder = getBase58Encoder();
  const secretKeyBytes = encoder.encode(privateKeyBase58);
  const keypairSigner = await createKeyPairSignerFromBytes(secretKeyBytes);

  const signer = new SvmClientSigner({
    signer: keypairSigner,
    chainId: SOLANA_MAINNET_CHAIN_ID,
    config: {
      rpcUrl: SOLANA_RPC_URL,
    },
  });

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
 * Get an AiMo provider for a specific model.
 * Each model uses its own wallet for API payments.
 *
 * @param modelId - Provider-specific model ID (e.g., "openai/gpt-5")
 * @param canonicalId - Canonical model ID for catalog lookup (e.g., "openai/gpt-5")
 * @returns AiMo provider configured with the model's wallet
 */
export async function getAimoProvider(
  modelId: string,
  canonicalId: string = modelId
) {
  const series = getSeriesFromModelId(canonicalId);

  // Return cached provider if available
  const cached = providerCache.get(series);
  if (cached) {
    return cached;
  }

  // Get wallet for this series
  const privateKey = WALLET_PRIVATE_KEYS[series];
  if (!privateKey) {
    throw new Error(
      `No wallet configured for model series "${series}". Set WALLET_${series.toUpperCase()}_PRIVATE environment variable.`
    );
  }

  // Create and cache the provider
  const provider = await createProviderWithWallet(privateKey);
  providerCache.set(series, provider);

  return provider;
}

/**
 * Get a language model from AiMo Network.
 * Uses the model's own wallet for API payments.
 *
 * @param modelId - Provider-specific model ID (e.g., "openai/gpt-5")
 * @param canonicalId - Canonical model ID for catalog lookup (defaults to modelId)
 * @returns Language model instance
 */
export async function getAimoModel(
  modelId: string,
  canonicalId: string = modelId
) {
  // Resolve the actual provider model ID from the catalog if available
  // This handles mapping internal IDs (e.g. "qwen/qwen3-max") to provider IDs (e.g. "qwen/qwen3-235b-a22b")
  const model = getModelById(canonicalId);
  const providerModelId = model?.providerIds?.aimo || modelId;

  const provider = await getAimoProvider(providerModelId, canonicalId);
  return provider.chat(providerModelId);
}
