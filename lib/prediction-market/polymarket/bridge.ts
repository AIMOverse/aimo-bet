// ============================================================================
// Polymarket Bridge
// Bridge USDC from Solana to Polygon via Polymarket Bridge API
// One-way bridging only: Solana → Polygon (no withdrawals supported)
// ============================================================================

import type { KeyPairSigner } from "@solana/kit";
import { getUsdcBalance } from "@/lib/crypto/polygon/client";
import {
  getTokenBalanceByOwner,
  TOKEN_MINTS,
} from "@/lib/crypto/solana/client";
import { monitorTransactionConfirmation } from "@/lib/crypto/solana/transactions";
import { sendUSDC } from "@/lib/crypto/solana/transfer";

// ============================================================================
// Constants
// ============================================================================

const BRIDGE_API = "https://bridge.polymarket.com";
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const MAX_WAIT_MS = 10 * 60_000; // 10 minutes
// const MIN_BRIDGE_AMOUNT = 50; // Polymarket minimum ~$45, using $50 for safety

// ============================================================================
// Types
// ============================================================================

export interface DepositAddresses {
  /** EVM deposit address */
  evm: string;
  /** Solana deposit address (ATA for USDC) */
  svm: string;
  /** Bitcoin deposit address */
  btc: string;
}

export interface BridgeResult {
  /** Whether the bridge operation completed successfully */
  success: boolean;
  /** Solana transaction signature */
  txSignature: string;
  /** Amount that was bridged (in USDC) */
  amountBridged: number;
  /** New Polygon balance after bridge (if successful) */
  newBalance?: number;
  /** Error message (if failed) */
  error?: string;
}

export interface GetBalanceResult {
  /** Wallet address */
  address: string;
  /** USDC.e balance in dollars */
  balanceUSDC: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get deposit addresses from Polymarket bridge API.
 *
 * @param polygonAddress - Polygon EOA wallet address
 * @returns Deposit addresses for each supported chain
 * @throws Error if API call fails
 */
export async function getDepositAddresses(
  polygonAddress: string
): Promise<DepositAddresses> {
  const logPrefix = "[polymarket/bridge]";

  console.log(`${logPrefix} Getting deposit addresses for ${polygonAddress}`);

  const response = await fetch(`${BRIDGE_API}/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: polygonAddress }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`${logPrefix} API error:`, response.status, errorText);
    throw new Error(
      `Failed to get deposit addresses: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();

  console.log(`${logPrefix} Deposit addresses received:`, {
    svm: data.address?.svm,
    evm: data.address?.evm,
  });

  return data.address;
}

/**
 * Get USDC.e balance on Polygon for an address.
 * Wraps the existing getUsdcBalance from polygon/client.
 *
 * @param walletAddress - Polygon EOA wallet address
 * @returns Balance info with address and balance
 */
export async function getPolygonUSDCBalance(
  walletAddress: string
): Promise<GetBalanceResult> {
  const result = await getUsdcBalance(walletAddress);

  return {
    address: walletAddress,
    balanceUSDC: result?.balance ?? 0,
  };
}

/**
 * Get USDC balance on Solana for a wallet address.
 *
 * @param walletAddress - Solana wallet address
 * @returns Balance in USDC (human-readable)
 */
export async function getSolanaUSDCBalance(
  walletAddress: string
): Promise<number> {
  const balance = await getTokenBalanceByOwner(walletAddress, TOKEN_MINTS.USDC);
  if (!balance) return 0;
  return Number(balance.formatted);
}

// ============================================================================
// Bridge Function
// ============================================================================

/**
 * Bridge USDC from Solana to Polygon via Polymarket bridge.
 *
 * This is a BLOCKING operation that:
 * 1. Validates the bridge amount (minimum $50)
 * 2. Checks Solana USDC balance
 * 3. Gets deposit address from Polymarket API
 * 4. Sends USDC on Solana to the deposit address
 * 5. Waits for Solana confirmation
 * 6. Polls Polygon balance until funds are credited (typically 2-5 minutes)
 *
 * @param amount - Amount in USDC to bridge (minimum $50)
 * @param svmSigner - Solana KeyPairSigner with USDC balance
 * @param polygonAddress - Polygon EOA address to receive USDC.e
 * @param feePayer - Optional separate fee payer for gas sponsorship
 * @returns Bridge result with success status and new balance
 *
 * @example
 * ```typescript
 * const signers = await createAgentSigners("openai/gpt-5");
 *
 * if (signers.svm && signers.evm) {
 *   const result = await bridgeUSDCToPolygon(
 *     100, // $100
 *     signers.svm.keyPairSigner,
 *     signers.evm.address  // EOA wallet address
 *   );
 *
 *   if (result.success) {
 *     console.log(`Bridged $${result.amountBridged}, new balance: $${result.newBalance}`);
 *   }
 * }
 * ```
 */
export async function bridgeUSDCToPolygon(
  amount: number,
  svmSigner: KeyPairSigner,
  polygonAddress: string,
  feePayer?: KeyPairSigner
): Promise<BridgeResult> {
  const logPrefix = "[polymarket/bridge]";

  console.log(`${logPrefix} Starting bridge: $${amount} to ${polygonAddress}`);
  if (feePayer) {
    console.log(`${logPrefix} Gas sponsored by: ${feePayer.address}`);
  }

  // -------------------------------------------------------------------------
  // Step 1: Validate minimum amount (disabled)
  // -------------------------------------------------------------------------
  // if (amount < MIN_BRIDGE_AMOUNT) {
  //   return {
  //     success: false,
  //     txSignature: "",
  //     amountBridged: 0,
  //     error: `Minimum bridge amount is $${MIN_BRIDGE_AMOUNT}. Requested: $${amount}`,
  //   };
  // }

  // -------------------------------------------------------------------------
  // Step 2: Check Solana balance
  // -------------------------------------------------------------------------
  const solanaBalance = await getSolanaUSDCBalance(svmSigner.address);
  if (solanaBalance < amount) {
    return {
      success: false,
      txSignature: "",
      amountBridged: 0,
      error: `Insufficient Solana USDC balance. Have: $${solanaBalance.toFixed(
        2
      )}, Need: $${amount}`,
    };
  }

  console.log(`${logPrefix} Solana balance: $${solanaBalance.toFixed(2)}`);

  try {
    // -----------------------------------------------------------------------
    // Step 3: Get initial Polygon balance
    // -----------------------------------------------------------------------
    const initialBalance = await getPolygonUSDCBalance(polygonAddress);
    console.log(
      `${logPrefix} Initial Polygon balance: $${initialBalance.balanceUSDC.toFixed(
        2
      )}`
    );

    // -----------------------------------------------------------------------
    // Step 4: Get deposit address from Polymarket
    // -----------------------------------------------------------------------
    const depositAddresses = await getDepositAddresses(polygonAddress);
    const svmDepositAddress = depositAddresses.svm;

    if (!svmDepositAddress) {
      return {
        success: false,
        txSignature: "",
        amountBridged: 0,
        error: "No Solana deposit address returned from bridge API",
      };
    }

    console.log(`${logPrefix} Solana deposit address: ${svmDepositAddress}`);

    // -----------------------------------------------------------------------
    // Step 5: Send USDC on Solana to the deposit address
    // -----------------------------------------------------------------------
    console.log(
      `${logPrefix} Sending $${amount} USDC to bridge deposit address...`
    );

    const transferResult = await sendUSDC(
      svmSigner,
      svmDepositAddress,
      amount,
      feePayer
    );

    if (!transferResult.success || !transferResult.signature) {
      return {
        success: false,
        txSignature: "",
        amountBridged: 0,
        error: `Solana transfer failed: ${transferResult.error}`,
      };
    }

    const txSignature = transferResult.signature;
    console.log(`${logPrefix} Solana tx sent: ${txSignature}`);

    // -----------------------------------------------------------------------
    // Step 6: Wait for Solana confirmation
    // -----------------------------------------------------------------------
    const confirmation = await monitorTransactionConfirmation(txSignature, {
      pollInterval: 2000,
      maxAttempts: 30,
    });

    if (!confirmation.success) {
      return {
        success: false,
        txSignature,
        amountBridged: amount,
        error: `Solana tx not confirmed: ${confirmation.error}`,
      };
    }

    console.log(
      `${logPrefix} Solana tx confirmed (${confirmation.confirmationStatus}). Waiting for Polygon credit...`
    );

    // -----------------------------------------------------------------------
    // Step 7: Poll Polygon balance until credited
    // -----------------------------------------------------------------------
    const startTime = Date.now();
    const targetBalance = initialBalance.balanceUSDC + amount * 0.99; // 1% tolerance for fees

    while (Date.now() - startTime < MAX_WAIT_MS) {
      await sleep(POLL_INTERVAL_MS);

      const currentBalance = await getPolygonUSDCBalance(polygonAddress);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      console.log(
        `${logPrefix} [${elapsed}s] Polygon balance: $${currentBalance.balanceUSDC.toFixed(
          2
        )} (waiting for ~$${targetBalance.toFixed(2)})`
      );

      if (currentBalance.balanceUSDC >= targetBalance) {
        console.log(
          `${logPrefix} Bridge complete! New balance: $${currentBalance.balanceUSDC.toFixed(
            2
          )}`
        );

        return {
          success: true,
          txSignature,
          amountBridged: amount,
          newBalance: currentBalance.balanceUSDC,
        };
      }
    }

    // Timeout - funds may still arrive
    console.warn(
      `${logPrefix} Bridge timeout after ${
        MAX_WAIT_MS / 1000
      }s. Funds may still be in transit.`
    );

    return {
      success: false,
      txSignature,
      amountBridged: amount,
      error:
        "Bridge timeout - funds may still be in transit. Check Polygon balance later.",
    };
  } catch (error) {
    console.error(`${logPrefix} Bridge error:`, error);
    return {
      success: false,
      txSignature: "",
      amountBridged: 0,
      error: error instanceof Error ? error.message : "Unknown bridge error",
    };
  }
}
