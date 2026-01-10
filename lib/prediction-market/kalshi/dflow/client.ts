// ============================================================================
// dflow API Client
// Shared client for all dflow API requests with authentication
// ============================================================================

const DFLOW_METADATA_API = "https://prediction-markets-api.dflow.net/api/v1";
const DFLOW_QUOTE_API = "https://a.quote-api.dflow.net";

/**
 * Get the dflow API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.DFLOW_API_KEY;
  if (!apiKey) {
    throw new Error("DFLOW_API_KEY environment variable is not configured");
  }
  return apiKey;
}

/**
 * Fetch from dflow Metadata API with authentication
 * Used for: markets, live-data, outcome-mints, trades
 */
export async function dflowMetadataFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const apiKey = getApiKey();
  const url = `${DFLOW_METADATA_API}${path}`;

  console.log("[dflow/client] Metadata API request:", url);

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...options?.headers,
    },
  });
}

/**
 * Fetch from dflow Quote API with authentication
 * Used for: order (GET quote + transaction), order-status
 * Docs: https://pond.dflow.net/swap-api-reference/order/order
 */
export async function dflowQuoteFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const apiKey = getApiKey();
  const url = `${DFLOW_QUOTE_API}${path}`;

  console.log("[dflow/client] Quote API request:", url);

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...options?.headers,
    },
  });
}
