// ============================================================================
// Polymarket Trade Execution
// Trading via CLOB (Central Limit Order Book) client
// Docs: https://docs.polymarket.com/
// ============================================================================

import {
  type ClobClient,
  Side,
  OrderType as ClobOrderType,
} from "@polymarket/clob-client";
import type { PolymarketTradeResult } from "@/lib/ai/tools/trade/types";

// ============================================================================
// Types
// ============================================================================

export interface PolymarketOrderRequest {
  /** Token ID from explainMarket (yes_token_id or no_token_id) */
  tokenId: string;
  /** Trade side */
  side: "BUY" | "SELL";
  /** Quantity of outcome tokens */
  size: number;
  /** Price 0-1 for limit orders */
  price?: number;
  /** Time in force: GTC, FOK, FAK (FAK = IOC equivalent) */
  orderType?: "GTC" | "FOK" | "FAK";
}

// ============================================================================
// Execute Market Order
// ============================================================================

/**
 * Execute a market order on Polymarket
 * Uses FOK (Fill or Kill) - order fills entirely or fails
 *
 * @param client - Initialized ClobClient
 * @param request - Order parameters
 * @returns Trade result with orderId and fill information
 */
export async function executeMarketOrder(
  client: ClobClient,
  request: PolymarketOrderRequest,
): Promise<PolymarketTradeResult> {
  const logPrefix = "[polymarket/trade:market]";

  try {
    console.log(`${logPrefix} Executing:`, {
      tokenId: request.tokenId.slice(0, 16) + "...",
      side: request.side,
      size: request.size,
    });

    // Get market parameters for order creation
    const tickSize = await client.getTickSize(request.tokenId);
    const negRisk = await client.getNegRisk(request.tokenId);

    const options = { tickSize, negRisk };

    // Execute market order with FOK (Fill or Kill)
    const response = await client.createAndPostMarketOrder(
      {
        tokenID: request.tokenId,
        side: request.side === "BUY" ? Side.BUY : Side.SELL,
        amount: request.size,
      },
      options,
      ClobOrderType.FOK,
    );

    console.log(`${logPrefix} Response:`, {
      success: response.success,
      orderID: response.orderID,
      status: response.status,
      errorMsg: response.errorMsg,
    });

    // Handle failure
    if (response.success === false || response.errorMsg) {
      return {
        success: false,
        orderId: response.orderID || "",
        status: "UNMATCHED",
        filledSize: 0,
        avgPrice: 0,
        error: response.errorMsg || "Market order failed",
      };
    }

    // Calculate fill details from response
    const takingAmount = parseFloat(response.takingAmount || "0");
    const makingAmount = parseFloat(response.makingAmount || "0");

    // For BUY: takingAmount = tokens received, makingAmount = USDC spent
    // For SELL: takingAmount = USDC received, makingAmount = tokens sold
    const filledSize =
      request.side === "BUY" ? takingAmount : makingAmount;
    const costOrProceeds =
      request.side === "BUY" ? makingAmount : takingAmount;
    const avgPrice = filledSize > 0 ? costOrProceeds / filledSize : 0;

    return {
      success: true,
      orderId: response.orderID,
      status: response.status === "MATCHED" ? "MATCHED" : "DELAYED",
      filledSize,
      avgPrice,
    };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      success: false,
      orderId: "",
      status: "UNMATCHED",
      filledSize: 0,
      avgPrice: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Execute Limit Order
// ============================================================================

/**
 * Execute a limit order on Polymarket
 * Order may rest on the book if not immediately filled
 *
 * @param client - Initialized ClobClient
 * @param request - Order parameters with required price
 * @returns Trade result with orderId and fill information
 */
export async function executeLimitOrder(
  client: ClobClient,
  request: PolymarketOrderRequest,
): Promise<PolymarketTradeResult> {
  const logPrefix = "[polymarket/trade:limit]";

  if (request.price === undefined) {
    return {
      success: false,
      orderId: "",
      status: "UNMATCHED",
      filledSize: 0,
      avgPrice: 0,
      error: "Price required for limit orders",
    };
  }

  try {
    console.log(`${logPrefix} Executing:`, {
      tokenId: request.tokenId.slice(0, 16) + "...",
      side: request.side,
      size: request.size,
      price: request.price,
      orderType: request.orderType || "GTC",
    });

    // Get market parameters
    const tickSize = await client.getTickSize(request.tokenId);
    const negRisk = await client.getNegRisk(request.tokenId);

    const options = { tickSize, negRisk };

    // For limit orders, only GTC is supported
    // FOK/FAK are only valid for market orders via createAndPostMarketOrder
    if (request.orderType === "FOK" || request.orderType === "FAK") {
      return {
        success: false,
        orderId: "",
        status: "UNMATCHED",
        filledSize: 0,
        avgPrice: 0,
        error: `Limit orders only support GTC. Use a market order for ${request.orderType} behavior.`,
      };
    }

    const response = await client.createAndPostOrder(
      {
        tokenID: request.tokenId,
        side: request.side === "BUY" ? Side.BUY : Side.SELL,
        size: request.size,
        price: request.price,
      },
      options,
      ClobOrderType.GTC,
    );

    console.log(`${logPrefix} Response:`, {
      success: response.success,
      orderID: response.orderID,
      status: response.status,
      errorMsg: response.errorMsg,
    });

    if (response.success === false || response.errorMsg) {
      return {
        success: false,
        orderId: response.orderID || "",
        status: "UNMATCHED",
        filledSize: 0,
        avgPrice: 0,
        error: response.errorMsg || "Limit order failed",
      };
    }

    // Calculate fill details
    const takingAmount = parseFloat(response.takingAmount || "0");
    const makingAmount = parseFloat(response.makingAmount || "0");

    const filledSize =
      request.side === "BUY" ? takingAmount : makingAmount;

    // Determine status: MATCHED = fully filled, LIVE = resting on book
    const status =
      response.status === "MATCHED"
        ? "MATCHED"
        : response.status === "LIVE"
          ? "LIVE"
          : "DELAYED";

    return {
      success: true,
      orderId: response.orderID,
      status,
      filledSize,
      avgPrice: request.price,
    };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      success: false,
      orderId: "",
      status: "UNMATCHED",
      filledSize: 0,
      avgPrice: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Cancel Order
// ============================================================================

/**
 * Cancel an open order on Polymarket
 *
 * @param client - Initialized ClobClient
 * @param orderId - Order ID to cancel
 * @returns Success status
 */
export async function cancelOrder(
  client: ClobClient,
  orderId: string,
): Promise<{ success: boolean; error?: string }> {
  const logPrefix = "[polymarket/trade:cancel]";

  try {
    console.log(`${logPrefix} Cancelling order:`, orderId);

    await client.cancelOrder({ orderID: orderId });

    console.log(`${logPrefix} Order cancelled successfully`);
    return { success: true };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Get Order Status
// ============================================================================

/**
 * Get the current status of an order
 *
 * @param client - Initialized ClobClient
 * @param orderId - Order ID to check
 * @returns Order status and filled size
 */
export async function getOrderStatus(
  client: ClobClient,
  orderId: string,
): Promise<{ status: string; filledSize: number; error?: string }> {
  const logPrefix = "[polymarket/trade:status]";

  try {
    const order = await client.getOrder(orderId);

    return {
      status: order.status,
      filledSize: parseFloat(order.size_matched || "0"),
    };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      status: "unknown",
      filledSize: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
