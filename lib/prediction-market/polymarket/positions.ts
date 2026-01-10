// ============================================================================
// Polymarket Positions API
// Fetching user positions via Data API (no auth required for read)
// Docs: https://docs.polymarket.com/
// ============================================================================

const DATA_API = "https://data-api.polymarket.com";

// ============================================================================
// Types
// ============================================================================

export interface PolymarketPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

export interface GetPositionsOptions {
  market?: string[];           // condition IDs
  eventId?: number[];
  sizeThreshold?: number;      // default: 1
  redeemable?: boolean;
  limit?: number;              // default: 100, max: 500
  offset?: number;
  sortBy?: "CURRENT" | "INITIAL" | "TOKENS" | "CASHPNL" | "PERCENTPNL" | "TITLE" | "RESOLVING" | "PRICE" | "AVGPRICE";
  sortDirection?: "ASC" | "DESC";
}

export interface ClosedPositionsOptions {
  limit?: number;
  offset?: number;
}

// ============================================================================
// Helper: Build Query String
// ============================================================================

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      // Handle arrays - repeat the key for each value
      for (const v of value) {
        searchParams.append(key, String(v));
      }
    } else {
      searchParams.append(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

// ============================================================================
// Get Open Positions
// ============================================================================

/**
 * Get open prediction market positions for a user
 * Uses the Polymarket Data API (no authentication required)
 *
 * @param userAddress - EOA wallet address (not proxy wallet)
 * @param options - Filter and pagination options
 * @returns Array of positions
 *
 * @example
 * ```typescript
 * const positions = await getPositions("0x1234...");
 * for (const p of positions) {
 *   console.log(`${p.title}: ${p.outcome} @ ${p.size} shares`);
 * }
 * ```
 */
export async function getPositions(
  userAddress: string,
  options?: GetPositionsOptions
): Promise<PolymarketPosition[]> {
  const logPrefix = "[polymarket/positions]";

  try {
    const queryParams: Record<string, unknown> = {
      user: userAddress,
      ...options,
    };

    const qs = buildQueryString(queryParams);
    const url = `${DATA_API}/positions${qs}`;

    console.log(`${logPrefix} Fetching positions:`, url);

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Error:`, response.status, errorText);
      throw new Error(`Data API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // The API returns an array directly
    if (Array.isArray(data)) {
      console.log(`${logPrefix} Found ${data.length} positions`);
      return data as PolymarketPosition[];
    }

    console.log(`${logPrefix} No positions found`);
    return [];
  } catch (error) {
    console.error(`${logPrefix} Error fetching positions:`, error);
    throw error;
  }
}

// ============================================================================
// Get Closed Positions
// ============================================================================

/**
 * Get closed (resolved) prediction market positions for a user
 *
 * @param userAddress - EOA wallet address
 * @param options - Pagination options
 * @returns Array of closed positions
 */
export async function getClosedPositions(
  userAddress: string,
  options?: ClosedPositionsOptions
): Promise<PolymarketPosition[]> {
  const logPrefix = "[polymarket/positions:closed]";

  try {
    const queryParams: Record<string, unknown> = {
      user: userAddress,
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    };

    const qs = buildQueryString(queryParams);
    const url = `${DATA_API}/v1/closed-positions${qs}`;

    console.log(`${logPrefix} Fetching closed positions:`, url);

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Error:`, response.status, errorText);
      throw new Error(`Data API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (Array.isArray(data)) {
      console.log(`${logPrefix} Found ${data.length} closed positions`);
      return data as PolymarketPosition[];
    }

    console.log(`${logPrefix} No closed positions found`);
    return [];
  } catch (error) {
    console.error(`${logPrefix} Error fetching closed positions:`, error);
    throw error;
  }
}

// ============================================================================
// Get Total Portfolio Value
// ============================================================================

/**
 * Get total portfolio value for a user
 *
 * @param userAddress - EOA wallet address
 * @returns Total portfolio value in USDC
 */
export async function getTotalValue(userAddress: string): Promise<number> {
  const logPrefix = "[polymarket/positions:value]";

  try {
    const url = `${DATA_API}/value?user=${encodeURIComponent(userAddress)}`;

    console.log(`${logPrefix} Fetching portfolio value:`, url);

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Error:`, response.status, errorText);
      throw new Error(`Data API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Response format: { value: number } or just a number
    const value = typeof data === "number" ? data : (data.value ?? 0);
    console.log(`${logPrefix} Portfolio value: $${value}`);

    return value;
  } catch (error) {
    console.error(`${logPrefix} Error fetching portfolio value:`, error);
    throw error;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get only redeemable positions (resolved markets with winning positions)
 */
export async function getRedeemablePositions(
  userAddress: string
): Promise<PolymarketPosition[]> {
  return getPositions(userAddress, { redeemable: true });
}

/**
 * Get positions for a specific market (by condition ID)
 */
export async function getPositionsByMarket(
  userAddress: string,
  conditionId: string
): Promise<PolymarketPosition[]> {
  return getPositions(userAddress, { market: [conditionId] });
}
