import { aimoNetwork } from "@aimo.network/provider";
import { SvmClientSigner, SOLANA_MAINNET_CHAIN_ID } from "@aimo.network/svm";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";

const AIMO_BASE_URL = "https://beta.aimo.network";

/**
 * Wallet private key mapping by model series.
 */
const WALLET_PRIVATE_KEYS: Record<string, string | undefined> = {
  openai: process.env.WALLET_OPENAI_PRIVATE,
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
  });

  return aimoNetwork({
    signer,
    baseURL: AIMO_BASE_URL,
  });
}

/**
 * Get series from model ID.
 * e.g., "openai/gpt-5.2" -> "openai"
 */
function getSeriesFromModelId(modelId: string): string {
  return modelId.split("/")[0];
}

/**
 * Get an AiMo provider for a specific model.
 * Each model uses its own wallet for API payments.
 *
 * @param modelId - Model ID (e.g., "openai/gpt-5.2")
 * @returns AiMo provider configured with the model's wallet
 */
export async function getAimoProvider(modelId: string) {
  const series = getSeriesFromModelId(modelId);

  // Return cached provider if available
  const cached = providerCache.get(series);
  if (cached) {
    return cached;
  }

  // Get wallet for this series
  const privateKey = WALLET_PRIVATE_KEYS[series];
  if (!privateKey) {
    throw new Error(
      `No wallet configured for model series "${series}". Set WALLET_${series.toUpperCase()}_PRIVATE environment variable.`,
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
 * @param modelId - Model ID (e.g., "openai/gpt-5.2")
 * @returns Language model instance
 */
export async function getAimoModel(modelId: string) {
  const provider = await getAimoProvider(modelId);
  return provider.chat(modelId);
}
