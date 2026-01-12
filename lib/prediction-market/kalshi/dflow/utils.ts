// ============================================================================
// dflow Utilities
// Shared utilities for dflow prediction markets and trade execution
// ============================================================================

import type {
  BaseMarketAccounts,
  PositionType,
} from "./prediction-markets/types";

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Response Handling
// ============================================================================

/**
 * Assert that a fetch response is successful, throwing a descriptive error if not
 *
 * @param response - The fetch Response object
 * @param action - Description of the action (e.g., "fetch events", "request order")
 * @throws Error with status code and response text
 */
export async function assertResponseOk(
  response: Response,
  action: string,
): Promise<void> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to ${action}: ${response.status} - ${errorText}`);
  }
}

// ============================================================================
// Outcome Matching Utilities
// ============================================================================

/**
 * Check if a market result matches a YES outcome
 * Handles various result formats: "yes", "true", "1"
 */
export function matchesYesOutcome(result: string): boolean {
  const normalized = result.toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "1";
}

/**
 * Check if a market result matches a NO outcome
 * Handles various result formats: "no", "false", "0"
 */
export function matchesNoOutcome(result: string): boolean {
  const normalized = result.toLowerCase();
  return normalized === "no" || normalized === "false" || normalized === "0";
}

/**
 * Check if a market result matches a given position type
 *
 * @param result - The market result string
 * @param positionType - The position type to check ("YES" or "NO")
 * @returns true if the result matches the position type
 */
export function isWinningOutcome(
  result: string,
  positionType: "YES" | "NO",
): boolean {
  if (positionType === "YES") {
    return matchesYesOutcome(result);
  }
  if (positionType === "NO") {
    return matchesNoOutcome(result);
  }
  return false;
}

// ============================================================================
// Position Type Detection
// ============================================================================

/**
 * Determine the position type (YES/NO) for a given mint address
 *
 * @param mint - The token mint address to check
 * @param accounts - Record of settlement mint to market accounts
 * @returns The position type: "YES", "NO", or "UNKNOWN"
 */
export function getPositionTypeForMint(
  mint: string,
  accounts: Record<string, BaseMarketAccounts>,
): PositionType {
  for (const accountKey of Object.keys(accounts || {})) {
    const account = accounts[accountKey];
    if (account.yesMint === mint) {
      return "YES";
    }
    if (account.noMint === mint) {
      return "NO";
    }
  }
  return "UNKNOWN";
}

/**
 * Check if a mint is a YES token in any of the market accounts
 */
export function isYesMint(
  mint: string,
  accounts: Record<string, BaseMarketAccounts>,
): boolean {
  return getPositionTypeForMint(mint, accounts) === "YES";
}

/**
 * Check if a mint is a NO token in any of the market accounts
 */
export function isNoMint(
  mint: string,
  accounts: Record<string, BaseMarketAccounts>,
): boolean {
  return getPositionTypeForMint(mint, accounts) === "NO";
}
