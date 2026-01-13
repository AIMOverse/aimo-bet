// ============================================================================
// Polymarket CLOB Client
// Trading client for Polymarket order book operations
// Automatically handles USDC allowance before trading
// Docs: https://docs.polymarket.com/
// ============================================================================

import { ClobClient } from "@polymarket/clob-client";
import {
  POLYGON_CHAIN_ID,
  getDefaultPolygonWallet,
  createPolygonWallet,
  type PolygonWallet,
} from "@/lib/crypto/polygon/client";
import { ensureAllowance, checkAllowance } from "./allowance";

const CLOB_HOST = "https://clob.polymarket.com";

/** Signature type for EOA wallets */
const EOA_SIGNATURE_TYPE = 0;

// ============================================================================
// Types
// ============================================================================

export interface TradingReadyClient {
  /** The initialized CLOB client */
  client: ClobClient;
  /** The wallet used by this client */
  wallet: PolygonWallet;
  /** Whether allowance approval was needed and performed */
  allowanceApproved: boolean;
}

// ============================================================================
// State
// ============================================================================

/**
 * Cached CLOB client instance (for default wallet only)
 */
let cachedClient: ClobClient | null = null;
let cachedWallet: PolygonWallet | null = null;

// ============================================================================
// Core Client Creation
// ============================================================================

/**
 * Create a Polymarket CLOB client with a specific wallet.
 * Note: Uses type cast because @polymarket/clob-client expects ethers v5 Wallet
 * but we use ethers v6. The runtime API is compatible.
 *
 * This is the low-level function - prefer createTradingClient() for trading.
 *
 * @param wallet - Polygon wallet to use for signing
 * @returns Initialized ClobClient with API credentials
 */
export async function createClobClient(
  wallet: PolygonWallet
): Promise<ClobClient> {
  // Create temp client to derive API credentials
  // Note: The "Could not create api key" error is misleading - it means the key
  // already exists and gets derived instead. We suppress console errors during this call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempClient = new ClobClient(CLOB_HOST, POLYGON_CHAIN_ID, wallet as any);

  // Suppress the noisy error log from the CLOB client
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args[0];
    if (
      typeof msg === "string" &&
      msg.includes("[CLOB Client] request error")
    ) {
      // Suppress this specific error - it's not actually fatal
      return;
    }
    originalConsoleError.apply(console, args);
  };

  let apiCreds;
  try {
    apiCreds = await tempClient.createOrDeriveApiKey();
  } finally {
    console.error = originalConsoleError;
  }

  // Return fully initialized client
  return new ClobClient(
    CLOB_HOST,
    POLYGON_CHAIN_ID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallet as any,
    apiCreds,
    EOA_SIGNATURE_TYPE
  );
}

// ============================================================================
// Trading-Ready Client (with Auto-Allowance)
// ============================================================================

/**
 * Create a trading-ready CLOB client that ensures USDC allowance is set.
 * This is the recommended function for trading - it handles:
 * 1. Creating the CLOB client with API credentials
 * 2. Checking USDC allowance for Polymarket contracts
 * 3. Auto-approving if needed (requires POL for gas)
 * 4. Updating Polymarket's allowance cache
 *
 * @param wallet - Polygon wallet to use
 * @returns Trading-ready client with allowance guaranteed
 * @throws Error if allowance cannot be set (e.g., no POL for gas)
 */
export async function createTradingClient(
  wallet: PolygonWallet
): Promise<TradingReadyClient> {
  const logPrefix = "[polymarket/clob]";

  // Create CLOB client
  const client = await createClobClient(wallet);

  // Ensure allowance is set (auto-approves if needed)
  const allowanceResult = await ensureAllowance(wallet, client);

  if (!allowanceResult.success) {
    throw new Error(
      `Failed to set up Polymarket allowance: ${allowanceResult.error}`
    );
  }

  if (allowanceResult.wasApprovalNeeded) {
    console.log(
      `${logPrefix} Auto-approved USDC allowance for ${wallet.address.slice(
        0,
        10
      )}...`
    );
  }

  return {
    client,
    wallet,
    allowanceApproved: allowanceResult.wasApprovalNeeded,
  };
}

/**
 * Create a trading-ready CLOB client from a private key.
 * Ensures USDC allowance is set before returning.
 *
 * @param privateKeyHex - Private key in hex format
 * @returns Trading-ready client
 */
export async function createTradingClientFromKey(
  privateKeyHex: string
): Promise<TradingReadyClient> {
  const wallet = createPolygonWallet(privateKeyHex);
  return createTradingClient(wallet);
}

// ============================================================================
// Convenience Functions (Backwards Compatible)
// ============================================================================

/**
 * Get the default Polymarket CLOB client.
 * Uses the default Polygon wallet from environment.
 * Caches the client for reuse.
 *
 * NOTE: This function does NOT ensure allowance. For trading, use
 * getDefaultTradingClient() instead.
 *
 * @returns Initialized ClobClient
 */
export async function getClobClient(): Promise<ClobClient> {
  if (cachedClient) {
    return cachedClient;
  }

  const wallet = getDefaultPolygonWallet();
  cachedClient = await createClobClient(wallet);
  cachedWallet = wallet;
  return cachedClient;
}

/**
 * Get the default trading-ready client.
 * Uses the default Polygon wallet and ensures allowance.
 *
 * @returns Trading-ready client
 */
export async function getDefaultTradingClient(): Promise<TradingReadyClient> {
  const wallet = getDefaultPolygonWallet();
  return createTradingClient(wallet);
}

/**
 * Create a CLOB client for a specific private key.
 * Useful for per-model wallets.
 *
 * NOTE: This function does NOT ensure allowance. For trading, use
 * createTradingClientFromKey() instead.
 *
 * @param privateKeyHex - Private key in hex format
 * @returns Initialized ClobClient
 */
export async function createClobClientFromKey(
  privateKeyHex: string
): Promise<ClobClient> {
  const wallet = createPolygonWallet(privateKeyHex);
  return createClobClient(wallet);
}

// ============================================================================
// Utility Exports
// ============================================================================

export { checkAllowance, ensureAllowance } from "./allowance";
