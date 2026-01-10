// ============================================================================
// Polymarket Gamma API Client
// Shared client for all Gamma API requests
// Docs: https://docs.polymarket.com/
// ============================================================================

const GAMMA_API = "https://gamma-api.polymarket.com";

/**
 * Fetch from Polymarket Gamma API
 * Used for: tags, events, markets, series, status
 */
export async function gammaFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const url = `${GAMMA_API}${path}`;

  console.log("[polymarket/client] Gamma API request:", url);

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}
