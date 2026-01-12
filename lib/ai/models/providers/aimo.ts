import { aimoNetwork } from "@aimo.network/provider";
import { getSeriesWallets } from "@/lib/crypto/wallets/registry";
import { createSvmSigner } from "@/lib/crypto/wallets/svm";
import { getModelById } from "../catalog";

const AIMO_BASE_URL = "https://beta.aimo.network";

/**
 * Google thought signature bypass value.
 * Used to skip validation for function calls that don't have thought signatures.
 * @see https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/function-calling
 */
const GOOGLE_THOUGHT_SIGNATURE_BYPASS = "skip_thought_signature_validator";

/**
 * Cache of initialized providers per series and chain.
 * Key format: "{series}:{chain}:{isGoogle}" (e.g., "gpt:svm:false", "gemini:svm:true")
 */
const providerCache = new Map<string, ReturnType<typeof aimoNetwork>>();

/**
 * Clear the provider cache. Useful for testing or when configuration changes.
 */
export function clearProviderCache() {
  console.log(
    `[AimoProvider] Clearing provider cache (${providerCache.size} entries)`
  );
  providerCache.clear();
}

// ============================================================================
// Google Thought Signature Capture & Injection
// ============================================================================

/**
 * Cache of thought signatures captured from Google model responses.
 * Maps tool_call_id -> thought_signature
 * These are captured from responses and injected back into subsequent requests.
 */
const thoughtSignatureCache = new Map<string, string>();

/**
 * Clear the thought signature cache.
 */
export function clearThoughtSignatureCache() {
  console.log(
    `[GoogleFetchWrapper] Clearing thought signature cache (${thoughtSignatureCache.size} entries)`
  );
  thoughtSignatureCache.clear();
}

/**
 * Structure of a tool call in the request/response body
 */
interface ToolCall {
  extra_content?: {
    google?: {
      thought_signature?: string;
    };
  };
  function?: {
    arguments?: string;
    name?: string;
  };
  id?: string;
  type?: string;
}

/**
 * Structure of a message in the request body
 */
interface RequestMessage {
  role?: string;
  tool_calls?: ToolCall[];
  content?: unknown;
}

/**
 * Request body structure for chat completions
 */
interface ChatRequestBody {
  messages?: RequestMessage[];
  [key: string]: unknown;
}

/**
 * Response body structure (OpenAI format)
 */
interface ChatResponseBody {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
      tool_calls?: ToolCall[];
    };
    delta?: {
      tool_calls?: ToolCall[];
    };
  }>;
}

/**
 * Capture thought signatures from response tool_calls and store in cache.
 */
function captureThoughtSignatures(responseBody: ChatResponseBody): void {
  if (!responseBody.choices) return;

  for (const choice of responseBody.choices) {
    const toolCalls = choice.message?.tool_calls || choice.delta?.tool_calls;
    if (!toolCalls) continue;

    for (const toolCall of toolCalls) {
      const signature = toolCall.extra_content?.google?.thought_signature;
      if (signature && toolCall.id) {
        console.log(
          `[GoogleFetchWrapper] Captured thought_signature for tool_call ${
            toolCall.id
          }: ${signature.slice(0, 50)}...`
        );
        thoughtSignatureCache.set(toolCall.id, signature);
      }
    }
  }
}

/**
 * Inject cached thought signatures into tool_calls that are missing them.
 * Falls back to bypass signature if no cached signature is found.
 */
function injectGoogleThoughtSignatures(body: ChatRequestBody): ChatRequestBody {
  if (!body.messages || !Array.isArray(body.messages)) {
    return body;
  }

  const updatedMessages = body.messages.map((message: RequestMessage) => {
    // Only process messages with tool_calls (typically from model/assistant role)
    if (!message.tool_calls || !Array.isArray(message.tool_calls)) {
      return message;
    }

    const updatedToolCalls = message.tool_calls.map((toolCall: ToolCall) => {
      // Check if signature is already present
      if (toolCall.extra_content?.google?.thought_signature) {
        return toolCall;
      }

      // Try to get cached signature for this tool_call
      const cachedSignature = toolCall.id
        ? thoughtSignatureCache.get(toolCall.id)
        : undefined;
      const signature = cachedSignature || GOOGLE_THOUGHT_SIGNATURE_BYPASS;

      if (cachedSignature) {
        console.log(
          `[GoogleFetchWrapper] Injecting cached signature for tool_call ${toolCall.id}`
        );
      } else {
        console.log(
          `[GoogleFetchWrapper] No cached signature for tool_call ${toolCall.id}, using bypass`
        );
      }

      // Inject the signature
      return {
        ...toolCall,
        extra_content: {
          ...toolCall.extra_content,
          google: {
            ...toolCall.extra_content?.google,
            thought_signature: signature,
          },
        },
      };
    });

    return {
      ...message,
      tool_calls: updatedToolCalls,
    };
  });

  return {
    ...body,
    messages: updatedMessages,
  };
}

/**
 * Create a fetch wrapper that injects Google thought signature bypass.
 * This wraps the global fetch and modifies request bodies for chat completion calls.
 */
function createGoogleFetchWrapper(): typeof fetch {
  console.log(
    "[GoogleFetchWrapper] Creating new Google fetch wrapper instance"
  );

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    console.log(
      `[GoogleFetchWrapper] Fetch called: ${init?.method || "GET"} ${url}`
    );

    // Only intercept POST requests with JSON bodies
    if (init?.method?.toUpperCase() === "POST" && init.body) {
      try {
        const bodyString =
          typeof init.body === "string" ? init.body : undefined;

        console.log(
          `[GoogleFetchWrapper] Intercepting POST request, body type: ${typeof init.body}, isString: ${
            typeof init.body === "string"
          }`
        );

        if (bodyString) {
          const body = JSON.parse(bodyString) as ChatRequestBody;

          // Inject thought signatures if messages exist
          if (body.messages) {
            // Debug: log message structure
            for (let i = 0; i < body.messages.length; i++) {
              const msg = body.messages[i];
              console.log(
                `[GoogleFetchWrapper] Message ${i}: role=${
                  msg.role
                }, has tool_calls=${!!msg.tool_calls}, keys=${Object.keys(
                  msg
                ).join(",")}`
              );
              if (msg.tool_calls) {
                console.log(
                  `[GoogleFetchWrapper]   tool_calls: ${JSON.stringify(
                    msg.tool_calls
                  ).slice(0, 200)}...`
                );
              }
            }

            console.log(
              `[GoogleFetchWrapper] Found ${body.messages.length} messages, checking for tool_calls...`
            );

            // Count tool_calls before injection
            const toolCallsBefore = body.messages.reduce((count, msg) => {
              return count + (msg.tool_calls?.length || 0);
            }, 0);

            const modifiedBody = injectGoogleThoughtSignatures(body);

            // Count tool_calls after injection (with signatures)
            const toolCallsAfter =
              modifiedBody.messages?.reduce((count, msg) => {
                const msgWithToolCalls = msg as RequestMessage;
                return count + (msgWithToolCalls.tool_calls?.length || 0);
              }, 0) || 0;

            console.log(
              `[GoogleFetchWrapper] Injected thought signatures: ${toolCallsBefore} tool_calls found, ${toolCallsAfter} after injection`
            );

            // Debug: Log the first tool_call after injection to verify format
            if (modifiedBody.messages) {
              for (const msg of modifiedBody.messages) {
                const typedMsg = msg as RequestMessage;
                if (typedMsg.tool_calls && typedMsg.tool_calls.length > 0) {
                  console.log(
                    `[GoogleFetchWrapper] Modified tool_call sample: ${JSON.stringify(
                      typedMsg.tool_calls[0]
                    )}`
                  );
                }
              }
            }

            init = {
              ...init,
              body: JSON.stringify(modifiedBody),
            };
          }
        } else {
          console.log(
            `[GoogleFetchWrapper] Body is not a string, type: ${init.body?.constructor?.name}`
          );
        }
      } catch (e) {
        // If parsing fails, proceed with original request
        console.error(`[GoogleFetchWrapper] Error processing request:`, e);
      }
    }

    // Make the actual fetch request
    const response = await fetch(input, init);

    // Capture thought signatures from response
    // Clone the response since we need to read the body
    try {
      const clonedResponse = response.clone();
      const responseText = await clonedResponse.text();

      console.log(
        `[GoogleFetchWrapper] Response status: ${response.status}, body length: ${responseText.length}`
      );

      if (responseText) {
        const responseBody = JSON.parse(responseText) as ChatResponseBody;
        console.log(
          `[GoogleFetchWrapper] Response has choices: ${!!responseBody.choices}, count: ${
            responseBody.choices?.length || 0
          }`
        );

        if (responseBody.choices?.[0]?.message?.tool_calls) {
          console.log(
            `[GoogleFetchWrapper] Response tool_calls: ${JSON.stringify(
              responseBody.choices[0].message.tool_calls
            )}`
          );
        }

        captureThoughtSignatures(responseBody);
      }
    } catch (e) {
      // Silently fail - response might be streaming or not JSON
      console.log(
        `[GoogleFetchWrapper] Could not capture response signatures: ${
          e instanceof Error ? e.message : "unknown"
        }`
      );
    }

    return response;
  };
}

// ============================================================================
// Provider Creation
// ============================================================================

/**
 * Create an AiMo Network provider with an SVM (Solana) wallet.
 * All inference payments use SVM (Solana) only.
 */
async function createSvmProvider(
  privateKeyBase58: string,
  useGoogleFetchWrapper: boolean = false
) {
  const signer = await createSvmSigner(privateKeyBase58);
  return aimoNetwork({
    signer,
    baseURL: AIMO_BASE_URL,
    ...(useGoogleFetchWrapper && { fetch: createGoogleFetchWrapper() }),
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
 * Each model uses its own SVM (Solana) wallet for API payments.
 *
 * @param modelId - Provider-specific model ID (e.g., "openai/gpt-5")
 * @param canonicalId - Canonical model ID for catalog lookup (e.g., "openai/gpt-5")
 * @returns AiMo provider configured with the model's SVM wallet
 */
export async function getAimoProvider(
  modelId: string,
  canonicalId: string = modelId
) {
  const model = getModelById(canonicalId);
  const series = getSeriesFromModelId(canonicalId);
  const isGoogleModel = model?.aimoSdkProvider === "google";
  const cacheKey = `${series}:svm:${isGoogleModel}`;

  console.log(
    `[AimoProvider] Getting provider for modelId="${modelId}", canonicalId="${canonicalId}", series="${series}", isGoogle=${isGoogleModel}`
  );

  // Return cached provider if available
  const cached = providerCache.get(cacheKey);
  if (cached) {
    console.log(
      `[AimoProvider] Using cached provider for series="${series}", isGoogle=${isGoogleModel}`
    );
    return cached;
  }

  // Get SVM wallet for this series
  const wallets = getSeriesWallets(series);
  const privateKey = wallets?.svm;
  if (!privateKey) {
    const envVarName = `WALLET_${series.toUpperCase()}_SVM_PRIVATE`;
    const error = `No SVM wallet configured for model series "${series}". Set ${envVarName} environment variable.`;
    console.error(`[AimoProvider] ${error}`);
    throw new Error(error);
  }

  console.log(
    `[AimoProvider] Creating new provider for series="${series}", isGoogle=${isGoogleModel}`
  );

  // Create SVM provider
  // Google models use a custom fetch wrapper to inject thought signature bypass
  const provider = await createSvmProvider(privateKey, isGoogleModel);

  // Cache and return the provider
  providerCache.set(cacheKey, provider);
  return provider;
}

/**
 * Get a language model from AiMo Network.
 * Uses the model's own SVM wallet for API payments.
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

  console.log(
    `[AimoProvider] getAimoModel: modelId="${modelId}", canonicalId="${canonicalId}", resolved="${providerModelId}"`
  );

  const provider = await getAimoProvider(providerModelId, canonicalId);
  return provider.chat(providerModelId);
}

/**
 * Check if a model series has an SVM wallet configured.
 * All inference payments use SVM (Solana) only.
 *
 * @param modelId - Model ID to check
 * @returns True if SVM wallet is configured
 */
export function hasWalletForModel(modelId: string): boolean {
  const series = getSeriesFromModelId(modelId);
  const wallets = getSeriesWallets(series);
  const key = wallets?.svm;
  return key !== undefined && key.length > 0;
}
