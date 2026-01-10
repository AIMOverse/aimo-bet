// ============================================================================
// Polymarket CLOB Client
// Trading client for Polymarket order book operations
// Docs: https://docs.polymarket.com/
// ============================================================================

import { ClobClient } from "@polymarket/clob-client";
import {
  POLYGON_CHAIN_ID,
  getDefaultPolygonWallet,
  createPolygonWallet,
} from "@/lib/crypto/polygon/client";

const CLOB_HOST = "https://clob.polymarket.com";

/** Signature type for EOA wallets */
const EOA_SIGNATURE_TYPE = 0;

/**
 * Cached CLOB client instance
 */
let cachedClient: ClobClient | null = null;

/**
 * Create a Polymarket CLOB client with a specific wallet.
 * Note: Uses type cast because @polymarket/clob-client expects ethers v5 Wallet
 * but we use ethers v6. The runtime API is compatible.
 *
 * @param wallet - ethers Wallet to use for signing
 * @returns Initialized ClobClient with API credentials
 */
export async function createClobClient(
  wallet: ReturnType<typeof createPolygonWallet>,
): Promise<ClobClient> {
  // Create temp client to derive API credentials
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempClient = new ClobClient(CLOB_HOST, POLYGON_CHAIN_ID, wallet as any);
  const apiCreds = await tempClient.createOrDeriveApiKey();

  // Return fully initialized client
  return new ClobClient(
    CLOB_HOST,
    POLYGON_CHAIN_ID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallet as any,
    apiCreds,
    EOA_SIGNATURE_TYPE,
  );
}

/**
 * Get the default Polymarket CLOB client.
 * Uses the default Polygon wallet from environment.
 * Caches the client for reuse.
 *
 * @returns Initialized ClobClient
 */
export async function getClobClient(): Promise<ClobClient> {
  if (cachedClient) {
    return cachedClient;
  }

  const wallet = getDefaultPolygonWallet();
  cachedClient = await createClobClient(wallet);
  return cachedClient;
}

/**
 * Create a CLOB client for a specific private key.
 * Useful for per-model wallets.
 *
 * @param privateKeyHex - Private key in hex format
 * @returns Initialized ClobClient
 */
export async function createClobClientFromKey(
  privateKeyHex: string,
): Promise<ClobClient> {
  const wallet = createPolygonWallet(privateKeyHex);
  return createClobClient(wallet);
}
