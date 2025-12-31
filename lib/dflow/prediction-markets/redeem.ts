// ============================================================================
// Prediction Market Redemption
// Functions for redeeming determined prediction market outcome tokens
// Docs: https://pond.dflow.net/quickstart/redeem-tokens
// ============================================================================

import { dflowMetadataFetch, dflowQuoteFetch } from "@/lib/dflow/client";
import { assertResponseOk, isWinningOutcome } from "@/lib/dflow/utils";
import { TOKEN_MINTS } from "@/lib/solana/client";
import { getUserPositions } from "./retrieve";
import type {
  MarketAccountsWithRedemption,
  MarketWithRedemption,
  RedemptionEligibility,
  RedemptionOrderResponse,
  RedeemablePosition,
  UserPosition,
} from "./types";

// Re-export types for convenience
export type {
  MarketAccountsWithRedemption,
  MarketWithRedemption,
  RedemptionEligibility,
  RedemptionOrderResponse,
  RedeemablePosition,
};

// ============================================================================
// Step 1: Check Redemption Eligibility
// ============================================================================

/**
 * Check if an outcome token is redeemable
 *
 * A token is redeemable when:
 * - Market status is "determined" or "finalized"
 * - Redemption status for the settlement mint is "open"
 * - Either:
 *   - The market result matches the user's outcome token (YES or NO)
 *   - OR the market has a scalar outcome (result = "" with scalarOutcomePct defined)
 *
 * @param outcomeMint - The outcome token mint address
 * @param settlementMint - Optional settlement mint (defaults to USDC)
 * @returns Eligibility result with details
 *
 * @example
 * ```typescript
 * const result = await checkRedemptionEligibility("YESMintAddress123...");
 * if (result.isRedeemable) {
 *   console.log(`Token redeemable for ${result.payoutPct * 100}%`);
 * }
 * ```
 */
export async function checkRedemptionEligibility(
  outcomeMint: string,
  settlementMint: string = TOKEN_MINTS.USDC,
): Promise<RedemptionEligibility> {
  try {
    // Fetch market details by mint address
    const response = await dflowMetadataFetch(
      `/market/by-mint/${encodeURIComponent(outcomeMint)}`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          isRedeemable: false,
          reason: "Outcome mint not found in any market",
          outcomeMint,
        };
      }
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch market: ${response.status} - ${errorText}`,
      );
    }

    const market: MarketWithRedemption = await response.json();

    // Check if market is determined or finalized
    if (market.status !== "determined" && market.status !== "finalized") {
      return {
        isRedeemable: false,
        reason: `Market is not determined. Current status: ${market.status}`,
        outcomeMint,
        market,
      };
    }

    // Check if settlement mint account exists
    const settlementAccount = market.accounts[settlementMint];
    if (!settlementAccount) {
      // Try to find any settlement mint with open redemption
      for (const [mint, account] of Object.entries(market.accounts)) {
        if (account.redemptionStatus === "open") {
          return checkEligibilityForAccount(outcomeMint, mint, account, market);
        }
      }
      return {
        isRedeemable: false,
        reason: `No settlement account found with open redemption`,
        outcomeMint,
        market,
      };
    }

    return checkEligibilityForAccount(
      outcomeMint,
      settlementMint,
      settlementAccount,
      market,
    );
  } catch (error) {
    console.error("[redeem] checkRedemptionEligibility error:", error);
    throw error;
  }
}

/**
 * Helper to check eligibility for a specific settlement account
 */
function checkEligibilityForAccount(
  outcomeMint: string,
  settlementMint: string,
  account: MarketAccountsWithRedemption,
  market: MarketWithRedemption,
): RedemptionEligibility {
  // Check redemption status
  if (account.redemptionStatus !== "open") {
    return {
      isRedeemable: false,
      reason: `Redemption is not open. Status: ${account.redemptionStatus}`,
      outcomeMint,
      settlementMint,
      market,
    };
  }

  const result = market.result;
  const isYesMint = account.yesMint === outcomeMint;
  const isNoMint = account.noMint === outcomeMint;

  if (!isYesMint && !isNoMint) {
    return {
      isRedeemable: false,
      reason: `Outcome mint does not match any outcome mint for this settlement account`,
      outcomeMint,
      settlementMint,
      market,
    };
  }

  const positionType = isYesMint ? "YES" : "NO";

  // Case 1: Standard determined outcome (result is "yes" or "no")
  if (result === "yes" || result === "no") {
    const isWinner = isWinningOutcome(result, positionType);

    if (!isWinner) {
      return {
        isRedeemable: false,
        reason: `Outcome token is for ${positionType}, but market result is ${result.toUpperCase()}`,
        outcomeMint,
        settlementMint,
        market,
        positionType,
        payoutPct: 0,
      };
    }

    return {
      isRedeemable: true,
      outcomeMint,
      settlementMint,
      market,
      positionType,
      payoutPct: 1.0, // 100% payout for winning outcome
    };
  }

  // Case 2: Scalar outcome (result is empty, scalarOutcomePct defined)
  if (
    result === "" &&
    account.scalarOutcomePct !== null &&
    account.scalarOutcomePct !== undefined
  ) {
    // Calculate payout percentage
    const yesPayoutPct = account.scalarOutcomePct / 10000;
    const noPayoutPct = (10000 - account.scalarOutcomePct) / 10000;
    const payoutPct = isYesMint ? yesPayoutPct : noPayoutPct;

    // Both YES and NO tokens are redeemable in scalar outcomes
    if (payoutPct <= 0) {
      return {
        isRedeemable: false,
        reason: `Scalar outcome payout is 0% for ${positionType} tokens`,
        outcomeMint,
        settlementMint,
        market,
        positionType,
        payoutPct: 0,
      };
    }

    return {
      isRedeemable: true,
      outcomeMint,
      settlementMint,
      market,
      positionType,
      payoutPct,
    };
  }

  // No result and no scalar outcome
  return {
    isRedeemable: false,
    reason: `Market has no result defined and no scalar outcome`,
    outcomeMint,
    settlementMint,
    market,
    positionType,
  };
}

// ============================================================================
// Step 2: Request Redemption Order
// ============================================================================

/**
 * Request a redemption order from the Trade API
 *
 * The redemption is treated as a trade where you swap your outcome token
 * for the settlement stablecoin. The returned transaction can be signed
 * and submitted like any other trade.
 *
 * @param outcomeMint - The outcome token mint to redeem
 * @param settlementMint - The settlement token to receive (e.g., USDC)
 * @param amount - Amount of outcome tokens to redeem (scaled integer, 6 decimals)
 * @param userPublicKey - The user's wallet public key
 * @returns Redemption order with transaction to sign
 *
 * @example
 * ```typescript
 * // Redeem 1 outcome token (6 decimals = 1000000)
 * const order = await requestRedemptionOrder(
 *   "YESMintAddress123...",
 *   TOKEN_MINTS.USDC,
 *   1000000,
 *   userWallet.publicKey.toBase58()
 * );
 * console.log(`Will receive ${order.outAmount} of ${order.outputMint}`);
 * ```
 */
export async function requestRedemptionOrder(
  outcomeMint: string,
  settlementMint: string,
  amount: number,
  userPublicKey: string,
): Promise<RedemptionOrderResponse> {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const queryParams = new URLSearchParams();
  queryParams.set("userPublicKey", userPublicKey);
  queryParams.set("inputMint", outcomeMint);
  queryParams.set("outputMint", settlementMint);
  queryParams.set("amount", amount.toString());

  console.log("[redeem] Requesting redemption order:", {
    outcomeMint,
    settlementMint,
    amount,
    userPublicKey,
  });

  const response = await dflowQuoteFetch(`/order?${queryParams.toString()}`);
  await assertResponseOk(response, "request redemption order");

  const order: RedemptionOrderResponse = await response.json();

  console.log("[redeem] Redemption order received:", {
    inAmount: order.inAmount,
    outAmount: order.outAmount,
    executionMode: order.executionMode,
    hasTransaction: !!order.transaction,
  });

  return order;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get all redeemable positions for a wallet
 *
 * This fetches all positions and checks which ones are eligible for redemption.
 *
 * @param wallet - The user's wallet address
 * @returns Array of redeemable positions with eligibility details
 *
 * @example
 * ```typescript
 * const redeemable = await getRedeemablePositions(walletAddress);
 * console.log(`Found ${redeemable.length} redeemable positions`);
 * for (const pos of redeemable) {
 *   console.log(`${pos.positionType} on ${pos.market?.title}: ${pos.quantity} tokens`);
 * }
 * ```
 */
export async function getRedeemablePositions(
  wallet: string,
): Promise<RedeemablePosition[]> {
  console.log("[redeem] Getting redeemable positions for wallet:", wallet);

  // Get all user positions
  const positionsResult = await getUserPositions(wallet);

  if (positionsResult.count === 0) {
    return [];
  }

  // Check eligibility for each position
  const redeemablePositions: RedeemablePosition[] = [];

  for (const position of positionsResult.positions) {
    try {
      const eligibility = await checkRedemptionEligibility(position.mint);

      if (eligibility.isRedeemable) {
        redeemablePositions.push({
          ...position,
          eligibility,
        });
      }
    } catch (error) {
      console.error(
        `[redeem] Error checking eligibility for ${position.mint}:`,
        error,
      );
      // Continue checking other positions
    }
  }

  console.log(
    "[redeem] Found",
    redeemablePositions.length,
    "redeemable positions",
  );

  return redeemablePositions;
}

/**
 * Redeem all eligible positions for a wallet
 *
 * This is a convenience function that:
 * 1. Gets all redeemable positions
 * 2. Requests redemption orders for each
 *
 * Note: You still need to sign and submit the transactions yourself.
 *
 * @param wallet - The user's wallet address
 * @returns Array of redemption orders (one per position)
 */
export async function redeemAllPositions(
  wallet: string,
): Promise<{ position: RedeemablePosition; order: RedemptionOrderResponse }[]> {
  const redeemablePositions = await getRedeemablePositions(wallet);

  if (redeemablePositions.length === 0) {
    console.log("[redeem] No redeemable positions found");
    return [];
  }

  const results: {
    position: RedeemablePosition;
    order: RedemptionOrderResponse;
  }[] = [];

  for (const position of redeemablePositions) {
    try {
      if (!position.eligibility.settlementMint) {
        console.error(
          `[redeem] No settlement mint for position ${position.mint}`,
        );
        continue;
      }

      // Convert balance to scaled amount (6 decimals)
      const amount = Math.floor(
        position.quantity * Math.pow(10, position.decimals),
      );

      const order = await requestRedemptionOrder(
        position.mint,
        position.eligibility.settlementMint,
        amount,
        wallet,
      );

      results.push({ position, order });
    } catch (error) {
      console.error(
        `[redeem] Error requesting redemption for ${position.mint}:`,
        error,
      );
      // Continue with other positions
    }
  }

  console.log("[redeem] Created", results.length, "redemption orders");

  return results;
}

/**
 * Calculate expected redemption value for a position
 *
 * @param quantity - Number of outcome tokens
 * @param payoutPct - Payout percentage (0-1)
 * @returns Expected redemption value in settlement tokens
 */
export function calculateRedemptionValue(
  quantity: number,
  payoutPct: number,
): number {
  return quantity * payoutPct;
}
