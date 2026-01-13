// ============================================================================
// Polymarket Trade Checker Script
// Tests Polymarket trading on Polygon
// Usage:
//   bun scripts/checkPolymarket.ts buy [amount]   - Buy tokens
//   bun scripts/checkPolymarket.ts sell           - Sell existing positions
//   bun scripts/checkPolymarket.ts [amount]       - Buy & sell roundtrip (legacy)
//
// NOTE: For bridging, use scripts/checkBridge.ts
// WARNING: This script moves REAL MONEY! Default amount is $5.
// ============================================================================

// Load environment variables FIRST
import "dotenv/config";

import {
  getUsdcBalance,
  createPolygonWallet,
} from "@/lib/crypto/polygon/client";
import { createTradingClient } from "@/lib/prediction-market/polymarket/clob";
import {
  executeMarketOrder,
  type PolymarketOrderRequest,
} from "@/lib/prediction-market/polymarket/trade";
import { getPositions } from "@/lib/prediction-market/polymarket/positions";

// ============================================================================
// Types
// ============================================================================

interface StepResult {
  step: string;
  success: boolean;
  duration: number;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Color Helpers
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ============================================================================
// Balance Check
// ============================================================================

async function getPolygonBalance(address: string): Promise<number> {
  const result = await getUsdcBalance(address);
  return result?.balance ?? 0;
}

// ============================================================================
// BUY: Find market and buy tokens
// ============================================================================

async function runBuy(
  tradeAmount: number,
  evmPrivateKey: string
): Promise<StepResult> {
  console.log("═".repeat(60));
  console.log("  📈 BUY: Purchase tokens on Polymarket");
  console.log("═".repeat(60));

  const startTime = Date.now();

  try {
    // Create trading client with auto-allowance
    console.log(`  Creating trading client (with auto-allowance)...`);
    const evmWallet = createPolygonWallet(evmPrivateKey);
    const { client: clobClient, allowanceApproved } = await createTradingClient(
      evmWallet
    );

    if (allowanceApproved) {
      console.log(
        `  ${colors.green}✓${colors.reset} Auto-approved USDC + CTF for Polymarket`
      );
    } else {
      console.log(`  ${colors.green}✓${colors.reset} Allowances already set`);
    }

    // Use Gamma API for open markets (CLOB API returns stale data)
    console.log(`  Fetching markets from Gamma API...`);
    const gammaResponse = await fetch(
      "https://gamma-api.polymarket.com/markets?closed=false&limit=50"
    );
    const gammaMarketsRaw = (await gammaResponse.json()) as Array<{
      id: string;
      question: string;
      clobTokenIds: string;
      outcomes: string;
      outcomePrices: string;
      active: boolean;
      closed: boolean;
    }>;

    const gammaMarkets = gammaMarketsRaw.map((m) => ({
      ...m,
      clobTokenIds: JSON.parse(m.clobTokenIds || "[]") as string[],
      outcomes: JSON.parse(m.outcomes || "[]") as string[],
      outcomePrices: JSON.parse(m.outcomePrices || "[]") as string[],
    }));

    console.log(`  Found ${gammaMarkets.length} open markets from Gamma API`);

    if (gammaMarkets.length === 0) {
      return {
        step: "Buy on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: "No open markets found",
      };
    }

    // Find a market with orderbook liquidity
    console.log(`  Verifying orderbooks...`);
    let selectedMarket: (typeof gammaMarkets)[0] | null = null;
    let selectedTokenId: string | null = null;

    for (const market of gammaMarkets) {
      if (!market.clobTokenIds || market.clobTokenIds.length === 0) continue;

      const yesTokenId = market.clobTokenIds[0];

      try {
        const orderbook = await clobClient.getOrderBook(yesTokenId);
        if (orderbook && orderbook.asks && orderbook.asks.length > 0) {
          const bestAskEntry = orderbook.asks[orderbook.asks.length - 1];
          const bestAsk = parseFloat(bestAskEntry.price);

          if (bestAsk >= 0.02 && bestAsk <= 0.98) {
            console.log(`  ✓ Found market: ${market.question.slice(0, 45)}...`);
            console.log(`    YES token: ${yesTokenId.slice(0, 16)}...`);
            console.log(`    Best ask: $${bestAsk.toFixed(3)}`);
            selectedMarket = market;
            selectedTokenId = yesTokenId;
            break;
          }
        }
      } catch {
        // Skip markets without orderbooks
      }
    }

    if (!selectedMarket || !selectedTokenId) {
      return {
        step: "Buy on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: "No markets with suitable liquidity found",
      };
    }

    const marketTitle = selectedMarket.question;

    console.log(`  Selected: ${marketTitle.slice(0, 50)}...`);
    console.log();
    console.log(
      `  ${colors.cyan}Buying $${tradeAmount} YES tokens...${colors.reset}`
    );

    const buyRequest: PolymarketOrderRequest = {
      tokenId: selectedTokenId,
      side: "BUY",
      size: tradeAmount,
    };

    const buyResult = await executeMarketOrder(clobClient, buyRequest);

    if (!buyResult.success) {
      return {
        step: "Buy on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: `Buy failed: ${buyResult.error}`,
        data: { market: marketTitle },
      };
    }

    console.log(
      `  ${colors.green}✓${
        colors.reset
      } Buy successful: ${buyResult.filledSize.toFixed(
        2
      )} tokens @ $${buyResult.avgPrice.toFixed(4)}`
    );
    console.log();
    console.log(`  ${colors.cyan}Token ID: ${selectedTokenId}${colors.reset}`);
    console.log(
      `  ${colors.yellow}Run 'bun scripts/checkPolymarket.ts sell' to sell${colors.reset}`
    );

    return {
      step: "Buy on Polymarket",
      success: true,
      duration: Date.now() - startTime,
      data: {
        market: marketTitle,
        tokenId: selectedTokenId,
        order_id: buyResult.orderId,
        filled: buyResult.filledSize,
        price: buyResult.avgPrice,
        cost: buyResult.filledSize * buyResult.avgPrice,
      },
    };
  } catch (error) {
    console.error(`  ${colors.red}✗ Buy error:${colors.reset}`, error);
    return {
      step: "Buy on Polymarket",
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// SELL: Fetch positions and sell existing holdings
// ============================================================================

async function runSell(
  evmPrivateKey: string,
  evmPublicKey: string
): Promise<StepResult> {
  console.log("═".repeat(60));
  console.log("  📉 SELL: Liquidate positions on Polymarket");
  console.log("═".repeat(60));

  const startTime = Date.now();

  try {
    // Create trading client with auto-allowance
    console.log(`  Creating trading client (with auto-allowance)...`);
    const evmWallet = createPolygonWallet(evmPrivateKey);
    const { client: clobClient, allowanceApproved } = await createTradingClient(
      evmWallet
    );

    if (allowanceApproved) {
      console.log(
        `  ${colors.green}✓${colors.reset} Auto-approved USDC + CTF for Polymarket`
      );
    } else {
      console.log(`  ${colors.green}✓${colors.reset} Allowances already set`);
    }

    // Fetch existing positions from Polymarket Data API
    console.log(`  Fetching positions for ${evmPublicKey.slice(0, 10)}...`);
    const positions = await getPositions(evmPublicKey, { sizeThreshold: 0.01 });

    console.log(`  Found ${positions.length} positions`);

    if (positions.length === 0) {
      console.log(`  ${colors.yellow}No positions to sell${colors.reset}`);
      return {
        step: "Sell on Polymarket",
        success: true,
        duration: Date.now() - startTime,
        data: { message: "No positions found" },
      };
    }

    // Display positions
    console.log();
    console.log("  Current positions:");
    for (const pos of positions) {
      console.log(`    • ${pos.title.slice(0, 40)}...`);
      console.log(
        `      ${pos.outcome}: ${pos.size.toFixed(
          2
        )} tokens @ $${pos.curPrice.toFixed(4)}`
      );
      console.log(`      Token: ${pos.asset.slice(0, 16)}...`);
    }
    console.log();

    // Pick the first position with size > 0
    const positionToSell = positions.find((p) => p.size > 0);

    if (!positionToSell) {
      console.log(
        `  ${colors.yellow}No positions with size > 0${colors.reset}`
      );
      return {
        step: "Sell on Polymarket",
        success: true,
        duration: Date.now() - startTime,
        data: { message: "All positions have zero size" },
      };
    }

    console.log(`  Selling position: ${positionToSell.title.slice(0, 45)}...`);
    console.log(`  Token ID: ${positionToSell.asset}`);
    console.log(`  Size: ${positionToSell.size.toFixed(2)} tokens`);
    console.log();

    // Check orderbook liquidity before selling
    console.log(
      `  ${colors.cyan}Checking orderbook liquidity...${colors.reset}`
    );
    const orderbook = await clobClient.getOrderBook(positionToSell.asset);

    // For SELL, we need BUY orders (bids) in the orderbook
    const bids = orderbook?.bids || [];
    let availableLiquidity = 0;
    let weightedPrice = 0;

    for (const bid of bids) {
      const price = parseFloat(bid.price);
      const size = parseFloat(bid.size);
      availableLiquidity += size;
      weightedPrice += price * size;
    }

    if (availableLiquidity > 0) {
      weightedPrice = weightedPrice / availableLiquidity;
    }

    console.log(
      `    Orderbook bids: ${bids.length} levels, ${availableLiquidity.toFixed(
        2
      )} tokens available`
    );
    console.log(`    Weighted avg bid: $${weightedPrice.toFixed(4)}`);

    if (availableLiquidity < 1) {
      console.log(
        `  ${colors.yellow}⚠ Very low liquidity - sell may not fill${colors.reset}`
      );
    }

    // Determine sell size: sell min of position size and 80% of available liquidity
    // Use 80% to account for slippage and other orders
    const maxSellable = Math.min(positionToSell.size, availableLiquidity * 0.8);

    // For FOK orders, we need whole numbers. If position < 1 token, sell entire position.
    // If position >= 1, round down to nearest integer.
    let sellSize: number;
    if (positionToSell.size < 1) {
      // Position is dust - try to sell it all (may fail if market doesn't accept fractional)
      sellSize = positionToSell.size;
      console.log(
        `  ${colors.yellow}⚠ Dust position (${sellSize.toFixed(
          2
        )} tokens) - attempting to sell all${colors.reset}`
      );
    } else {
      // Normal position - round down to avoid "not enough balance"
      sellSize = Math.floor(maxSellable);
      if (sellSize < 1) {
        console.log(
          `  ${colors.yellow}⚠ Insufficient liquidity to sell even 1 token${colors.reset}`
        );
        return {
          step: "Sell on Polymarket",
          success: false,
          duration: Date.now() - startTime,
          error: "Insufficient liquidity",
          data: { availableLiquidity, positionSize: positionToSell.size },
        };
      }
    }

    if (sellSize < positionToSell.size) {
      console.log(
        `  ${
          colors.yellow
        }⚠ Reducing sell size due to liquidity: ${positionToSell.size.toFixed(
          2
        )} → ${sellSize}${colors.reset}`
      );
    }

    console.log(
      `  ${colors.cyan}Selling ${sellSize} ${positionToSell.outcome} tokens...${colors.reset}`
    );

    const sellRequest: PolymarketOrderRequest = {
      tokenId: positionToSell.asset,
      side: "SELL",
      size: sellSize,
    };

    const sellResult = await executeMarketOrder(clobClient, sellRequest);

    if (!sellResult.success) {
      console.warn(
        `  ${colors.red}✗ Sell failed: ${sellResult.error}${colors.reset}`
      );
      return {
        step: "Sell on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: `Sell failed: ${sellResult.error}`,
        data: {
          market: positionToSell.title,
          tokenId: positionToSell.asset,
          size: sellSize,
          availableLiquidity,
        },
      };
    }

    console.log(
      `  ${colors.green}✓${
        colors.reset
      } Sell successful: ${sellResult.filledSize.toFixed(
        2
      )} tokens @ $${sellResult.avgPrice.toFixed(4)}`
    );

    const proceeds = sellResult.filledSize * sellResult.avgPrice;
    const costBasis =
      (positionToSell.initialValue / positionToSell.size) *
      sellResult.filledSize;
    const pnl = proceeds - costBasis;

    console.log();
    console.log(`  Cost basis:    $${costBasis.toFixed(4)}`);
    console.log(`  Sell proceeds: $${proceeds.toFixed(4)}`);
    console.log(
      `  P&L:           ${pnl >= 0 ? colors.green : colors.red}$${pnl.toFixed(
        4
      )}${colors.reset}`
    );

    const remaining = positionToSell.size - sellResult.filledSize;
    if (remaining > 0.01) {
      console.log();
      console.log(
        `  ${colors.yellow}Remaining: ${remaining.toFixed(
          2
        )} tokens still held${colors.reset}`
      );
    }

    return {
      step: "Sell on Polymarket",
      success: true,
      duration: Date.now() - startTime,
      data: {
        market: positionToSell.title,
        tokenId: positionToSell.asset,
        order_id: sellResult.orderId,
        filled: sellResult.filledSize,
        price: sellResult.avgPrice,
        proceeds,
        pnl,
        remaining,
      },
    };
  } catch (error) {
    console.error(`  ${colors.red}✗ Sell error:${colors.reset}`, error);
    return {
      step: "Sell on Polymarket",
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// ROUNDTRIP: Buy then sell (legacy behavior)
// ============================================================================

async function runRoundtrip(
  tradeAmount: number,
  evmPrivateKey: string,
  evmPublicKey: string
): Promise<StepResult> {
  console.log("═".repeat(60));
  console.log("  📈 Trade: Buy & Sell Roundtrip on Polymarket");
  console.log("═".repeat(60));

  const startTime = Date.now();

  try {
    // Create trading client with auto-allowance
    console.log(`  Creating trading client (with auto-allowance)...`);
    const evmWallet = createPolygonWallet(evmPrivateKey);
    const { client: clobClient, allowanceApproved } = await createTradingClient(
      evmWallet
    );

    if (allowanceApproved) {
      console.log(
        `  ${colors.green}✓${colors.reset} Auto-approved USDC + CTF for Polymarket`
      );
    } else {
      console.log(`  ${colors.green}✓${colors.reset} Allowances already set`);
    }

    // Use Gamma API for open markets (CLOB API returns stale data)
    console.log(`  Fetching markets from Gamma API...`);
    const gammaResponse = await fetch(
      "https://gamma-api.polymarket.com/markets?closed=false&limit=50"
    );
    const gammaMarketsRaw = (await gammaResponse.json()) as Array<{
      id: string;
      question: string;
      clobTokenIds: string;
      outcomes: string;
      outcomePrices: string;
      active: boolean;
      closed: boolean;
    }>;

    const gammaMarkets = gammaMarketsRaw.map((m) => ({
      ...m,
      clobTokenIds: JSON.parse(m.clobTokenIds || "[]") as string[],
      outcomes: JSON.parse(m.outcomes || "[]") as string[],
      outcomePrices: JSON.parse(m.outcomePrices || "[]") as string[],
    }));

    console.log(`  Found ${gammaMarkets.length} open markets from Gamma API`);

    if (gammaMarkets.length === 0) {
      return {
        step: "Trade on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: "No open markets found",
      };
    }

    // Find a market with orderbook liquidity
    console.log(`  Verifying orderbooks...`);
    let selectedMarket: (typeof gammaMarkets)[0] | null = null;
    let selectedTokenId: string | null = null;

    for (const market of gammaMarkets) {
      if (!market.clobTokenIds || market.clobTokenIds.length === 0) continue;

      const yesTokenId = market.clobTokenIds[0];

      try {
        const orderbook = await clobClient.getOrderBook(yesTokenId);
        if (orderbook && orderbook.asks && orderbook.asks.length > 0) {
          const bestAskEntry = orderbook.asks[orderbook.asks.length - 1];
          const bestAsk = parseFloat(bestAskEntry.price);

          if (bestAsk >= 0.02 && bestAsk <= 0.98) {
            console.log(`  ✓ Found market: ${market.question.slice(0, 45)}...`);
            selectedMarket = market;
            selectedTokenId = yesTokenId;
            break;
          }
        }
      } catch {
        // Skip
      }
    }

    if (!selectedMarket || !selectedTokenId) {
      return {
        step: "Trade on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: "No markets with suitable liquidity found",
      };
    }

    const marketTitle = selectedMarket.question;

    console.log(`  Selected: ${marketTitle.slice(0, 50)}...`);
    console.log();

    // BUY
    console.log(
      `  ${colors.cyan}Buying $${tradeAmount} YES tokens...${colors.reset}`
    );
    const buyResult = await executeMarketOrder(clobClient, {
      tokenId: selectedTokenId,
      side: "BUY",
      size: tradeAmount,
    });

    if (!buyResult.success) {
      return {
        step: "Trade on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: `Buy failed: ${buyResult.error}`,
      };
    }

    console.log(
      `  ${colors.green}✓${colors.reset} Buy: ${buyResult.filledSize.toFixed(
        2
      )} tokens @ $${buyResult.avgPrice.toFixed(4)}`
    );

    // Wait for tokens to settle on-chain before selling
    // Polymarket needs time to register the tokens in the account
    console.log(
      `  ${colors.gray}Waiting for token settlement...${colors.reset}`
    );

    // Poll for position to appear (max 30 seconds)
    let actualPosition = 0;
    const maxWaitMs = 30000;
    const pollIntervalMs = 3000;
    const startWait = Date.now();

    while (Date.now() - startWait < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      // Check positions API for the token
      const positions = await getPositions(evmPublicKey, {
        sizeThreshold: 0.01,
      });
      const pos = positions.find((p) => p.asset === selectedTokenId);

      if (pos && pos.size >= buyResult.filledSize * 0.95) {
        // Found position with at least 95% of expected size
        actualPosition = pos.size;
        console.log(
          `  ${colors.green}✓${
            colors.reset
          } Position confirmed: ${actualPosition.toFixed(2)} tokens`
        );
        break;
      }

      console.log(
        `  ${colors.gray}...still waiting (${Math.floor(
          (Date.now() - startWait) / 1000
        )}s)${colors.reset}`
      );
    }

    if (actualPosition < 1) {
      console.log(
        `  ${colors.yellow}⚠ Position not confirmed, attempting sell anyway${colors.reset}`
      );
      actualPosition = buyResult.filledSize;
    }

    // Round down to avoid "not enough balance" errors
    const sellSize = Math.floor(actualPosition);

    if (sellSize < 1) {
      console.log(
        `  ${
          colors.yellow
        }⚠ Position too small to sell (${actualPosition.toFixed(2)} tokens)${
          colors.reset
        }`
      );
      return {
        step: "Trade on Polymarket",
        success: true, // Buy succeeded
        duration: Date.now() - startTime,
        data: {
          market: marketTitle,
          buy_filled: buyResult.filledSize,
          sell_skipped: "Position too small",
        },
      };
    }

    console.log(`  ${colors.cyan}Selling ${sellSize} tokens...${colors.reset}`);
    const sellResult = await executeMarketOrder(clobClient, {
      tokenId: selectedTokenId,
      side: "SELL",
      size: sellSize,
    });

    if (!sellResult.success) {
      return {
        step: "Trade on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: `Sell failed: ${sellResult.error}`,
        data: { buy_filled: buyResult.filledSize },
      };
    }

    console.log(
      `  ${colors.green}✓${colors.reset} Sell: ${sellResult.filledSize.toFixed(
        2
      )} tokens @ $${sellResult.avgPrice.toFixed(4)}`
    );

    const buyCost = buyResult.filledSize * buyResult.avgPrice;
    const sellProceeds = sellResult.filledSize * sellResult.avgPrice;
    const pnl = sellProceeds - buyCost;

    console.log();
    console.log(
      `  P&L: ${pnl >= 0 ? colors.green : colors.red}$${pnl.toFixed(4)}${
        colors.reset
      }`
    );

    return {
      step: "Trade on Polymarket",
      success: true,
      duration: Date.now() - startTime,
      data: {
        market: marketTitle,
        buy_filled: buyResult.filledSize,
        sell_filled: sellResult.filledSize,
        pnl,
      },
    };
  } catch (error) {
    console.error(`  ${colors.red}✗ Error:${colors.reset}`, error);
    return {
      step: "Trade on Polymarket",
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Wallet Setup
// ============================================================================

function setupWallet() {
  const evmPrivateKey = process.env.WALLET_GPT_EVM_PRIVATE;
  const evmPublicKey = process.env.WALLET_GPT_EVM_PUBLIC;

  if (!evmPrivateKey || !evmPublicKey) {
    console.error(
      `${colors.red}✗ Missing WALLET_GPT_EVM_PRIVATE or WALLET_GPT_EVM_PUBLIC${colors.reset}`
    );
    process.exit(1);
  }

  console.log(`  Polygon wallet: ${evmPublicKey.slice(0, 10)}...`);
  console.log();

  return {
    evmPrivateKey,
    evmPublicKey,
  };
}

// ============================================================================
// Summary
// ============================================================================

function printSummary(results: StepResult[]): void {
  console.log("═".repeat(60));
  console.log("  Summary");
  console.log("═".repeat(60));
  console.log();

  let totalDuration = 0;
  for (const result of results) {
    const icon = result.success
      ? `${colors.green}✓${colors.reset}`
      : `${colors.red}✗${colors.reset}`;
    console.log(
      `  ${icon} ${result.step} (${formatDuration(result.duration)})`
    );
    if (result.error) {
      console.log(`    ${colors.red}Error: ${result.error}${colors.reset}`);
    }
    totalDuration += result.duration;
  }

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log();
  console.log("═".repeat(60));
  console.log(
    `  ${passed} passed, ${failed} failed | Total time: ${formatDuration(
      totalDuration
    )}`
  );
  console.log("═".repeat(60));
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Polymarket Trade Checker

Tests Polymarket trading on Polygon.

Usage:
  bun scripts/checkPolymarket.ts buy [amount]   Buy tokens on Polymarket
  bun scripts/checkPolymarket.ts sell           Sell existing positions
  bun scripts/checkPolymarket.ts [amount]       Buy & sell roundtrip (legacy)

Commands:
  buy     Find a market and buy YES tokens
  sell    Fetch existing positions and sell one

Arguments:
  amount    Amount in USD to trade (default: 5)

Examples:
  bun scripts/checkPolymarket.ts buy        # Buy $5 worth of tokens
  bun scripts/checkPolymarket.ts buy 10     # Buy $10 worth
  bun scripts/checkPolymarket.ts sell       # Sell an existing position
  bun scripts/checkPolymarket.ts            # Buy & sell roundtrip

Environment variables required:
  WALLET_GPT_EVM_PRIVATE   Polygon wallet private key (hex)
  WALLET_GPT_EVM_PUBLIC    Polygon wallet address

⚠ WARNING: This script moves REAL MONEY!
`);
  process.exit(0);
}

// Parse command
const command = args[0];
const isBuy = command === "buy";
const isSell = command === "sell";
const isRoundtrip = !isBuy && !isSell;

// Get amount (skip command if present)
const amountArg = isBuy || isSell ? args[1] : args[0];
const amount = Math.max(1, parseInt(amountArg || "5", 10));

async function main() {
  console.log("═".repeat(60));
  console.log("  🎰 Polymarket Trade Checker");
  console.log("═".repeat(60));
  console.log();
  console.log(
    `  ${colors.yellow}⚠ WARNING: This script moves REAL MONEY!${colors.reset}`
  );
  if (isBuy) {
    console.log(`  ${colors.cyan}Mode: BUY $${amount}${colors.reset}`);
  } else if (isSell) {
    console.log(`  ${colors.cyan}Mode: SELL existing positions${colors.reset}`);
  } else {
    console.log(
      `  ${colors.cyan}Mode: ROUNDTRIP (buy $${amount} then sell)${colors.reset}`
    );
  }
  console.log();

  const { evmPrivateKey, evmPublicKey } = setupWallet();

  // Check balance
  const balance = await getPolygonBalance(evmPublicKey);
  console.log(`  Polygon USDC balance: $${balance.toFixed(2)}`);
  console.log();

  // Run appropriate mode
  let result: StepResult;

  if (isSell) {
    result = await runSell(evmPrivateKey, evmPublicKey);
  } else if (isBuy) {
    if (balance < amount) {
      console.error(
        `${colors.red}✗ Insufficient balance. Have: $${balance.toFixed(
          2
        )}, Need: $${amount}${colors.reset}`
      );
      process.exit(1);
    }
    result = await runBuy(amount, evmPrivateKey);
  } else {
    // Roundtrip
    if (balance < amount) {
      console.error(
        `${colors.red}✗ Insufficient balance. Have: $${balance.toFixed(
          2
        )}, Need: $${amount}${colors.reset}`
      );
      process.exit(1);
    }
    result = await runRoundtrip(amount, evmPrivateKey, evmPublicKey);
  }

  printSummary([result]);

  if (!result.success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
