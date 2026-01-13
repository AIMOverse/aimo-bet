// ============================================================================
// Polymarket Tool Checker Script
// Tests Polymarket trading on Polygon
// Usage: bun scripts/checkPolymarket.ts [--deposit|--trade] [amount]
//
// NOTE: For bridging, use scripts/checkBridge.ts instead
// WARNING: This script moves REAL MONEY! Default amount is $10.
// ============================================================================

// Load environment variables FIRST
import "dotenv/config";

import { getCurrencyBalance } from "@/lib/crypto/solana/client";
import {
  getUsdcBalance,
  createPolygonWallet,
} from "@/lib/crypto/polygon/client";
import { bridgeUSDCToPolygon } from "@/lib/prediction-market/polymarket/bridge";
import { createSignerFromBase58SecretKey } from "@/lib/crypto/solana/wallets";
import { getSponsorSigner } from "@/lib/crypto/solana/sponsor";
import { createClobClient } from "@/lib/prediction-market/polymarket/clob";
import {
  executeMarketOrder,
  type PolymarketOrderRequest,
} from "@/lib/prediction-market/polymarket/trade";

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
// Balance Check Functions
// ============================================================================

async function getSolanaBalance(address: string): Promise<number> {
  const result = await getCurrencyBalance(address, "USDC");
  return result ? Number(result.formatted) : 0;
}

async function getPolygonBalance(address: string): Promise<number> {
  const result = await getUsdcBalance(address);
  return result?.balance ?? 0;
}

// ============================================================================
// Step 1: Deposit (Solana → Polygon)
// ============================================================================

async function runDeposit(
  amount: number,
  svmSigner: Awaited<ReturnType<typeof createSignerFromBase58SecretKey>>,
  evmPublicKey: string,
  sponsorSigner: Awaited<ReturnType<typeof getSponsorSigner>>
): Promise<StepResult> {
  console.log("═".repeat(60));
  console.log("  💰 Deposit: Solana → Polygon (Polymarket Bridge)");
  console.log("═".repeat(60));
  console.log(`  Bridging $${amount}...`);
  if (sponsorSigner) {
    console.log(
      `  ${colors.cyan}Gas sponsored by platform wallet${colors.reset}`
    );
  }

  const startTime = Date.now();

  const bridgeResult = await bridgeUSDCToPolygon(
    amount,
    svmSigner,
    evmPublicKey,
    sponsorSigner ?? undefined
  );

  if (!bridgeResult.success) {
    console.error(
      `  ${colors.red}✗ Bridge failed: ${bridgeResult.error}${colors.reset}`
    );
    return {
      step: "Deposit to Polygon",
      success: false,
      duration: Date.now() - startTime,
      error: bridgeResult.error,
    };
  }

  console.log(`  ${colors.green}✓${colors.reset} Bridge successful!`);
  console.log(`  TX: ${bridgeResult.txSignature.slice(0, 20)}...`);
  console.log(`  Amount bridged: $${bridgeResult.amountBridged}`);
  console.log(`  New Polygon balance: $${bridgeResult.newBalance?.toFixed(2)}`);
  console.log(`  Duration: ${formatDuration(Date.now() - startTime)}`);
  console.log();

  return {
    step: "Deposit to Polygon",
    success: true,
    duration: Date.now() - startTime,
    data: {
      tx_signature: bridgeResult.txSignature,
      amount_bridged: bridgeResult.amountBridged,
      new_balance: bridgeResult.newBalance,
    },
  };
}

// ============================================================================
// Step 2: Trade on Polymarket
// ============================================================================

// Market response type from CLOB API
interface ClobMarket {
  condition_id: string;
  question: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
  }>;
  min_incentive_size: string;
  max_incentive_spread: string;
  active: boolean;
  closed: boolean;
  neg_risk: boolean;
  archived: boolean;
}

interface ClobMarketsResponse {
  data: ClobMarket[];
  next_cursor: string;
}

async function runTrade(
  tradeAmount: number,
  evmPrivateKey: string
): Promise<StepResult> {
  console.log("═".repeat(60));
  console.log("  📈 Trade: Buy & Sell on Polymarket");
  console.log("═".repeat(60));

  const startTime = Date.now();
  const evmWallet = createPolygonWallet(evmPrivateKey);

  try {
    // Create CLOB client
    console.log(`  Creating CLOB client...`);
    const clobClient = await createClobClient(evmWallet);

    // Use Gamma API for open markets (CLOB API returns stale data)
    console.log(`  Fetching markets from Gamma API...`);
    const gammaResponse = await fetch(
      "https://gamma-api.polymarket.com/markets?closed=false&limit=50"
    );
    const gammaMarketsRaw = (await gammaResponse.json()) as Array<{
      id: string;
      question: string;
      clobTokenIds: string; // JSON string, e.g. '["token1","token2"]'
      outcomes: string; // JSON string
      outcomePrices: string; // JSON string
      active: boolean;
      closed: boolean;
    }>;

    // Parse JSON string fields
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
    let selectedPrice: number | null = null;

    for (const market of gammaMarkets) {
      if (!market.clobTokenIds || market.clobTokenIds.length === 0) {
        continue;
      }

      // Get YES token (first outcome)
      const yesTokenId = market.clobTokenIds[0];

      try {
        const orderbook = await clobClient.getOrderBook(yesTokenId);
        if (orderbook && orderbook.asks && orderbook.asks.length > 0) {
          // Polymarket orderbooks: asks sorted descending, so last = lowest (best) ask
          const bestAskEntry = orderbook.asks[orderbook.asks.length - 1];
          const bestAsk = parseFloat(bestAskEntry.price);

          // Skip markets that are essentially resolved (99%+ or 1%-)
          if (bestAsk >= 0.02 && bestAsk <= 0.98) {
            console.log(
              `  ✓ Found market with liquidity: ${market.question.slice(
                0,
                45
              )}...`
            );
            console.log(`    YES token: ${yesTokenId.slice(0, 16)}...`);
            console.log(
              `    Best ask: $${bestAsk.toFixed(3)} (${
                orderbook.asks.length
              } asks)`
            );
            selectedMarket = market;
            selectedTokenId = yesTokenId;
            selectedPrice = bestAsk;
            break;
          } else {
            console.log(
              `    Skipping ${market.question.slice(
                0,
                30
              )}... (price ${bestAsk.toFixed(3)} out of range)`
            );
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Only log unexpected errors, not "no orderbook" errors
        if (!errMsg.includes("404") && !errMsg.includes("orderbook")) {
          console.log(
            `    Error fetching orderbook for ${market.question.slice(
              0,
              25
            )}...: ${errMsg}`
          );
        }
      }
    }

    if (!selectedMarket || !selectedTokenId) {
      return {
        step: "Trade on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error:
          "No markets with suitable liquidity found (all either resolved or illiquid)",
      };
    }

    const marketTitle = selectedMarket.question;
    const yesTokenId = selectedTokenId;

    console.log(`  Selected market: ${marketTitle.slice(0, 50)}...`);
    console.log();

    // Calculate size based on current price (buy $5 worth)
    // Market orders don't need a price, just the dollar amount
    const buySize = tradeAmount;

    // BUY YES tokens
    console.log(
      `  ${colors.cyan}Buying $${buySize} YES tokens...${colors.reset}`
    );
    const buyRequest: PolymarketOrderRequest = {
      tokenId: yesTokenId,
      side: "BUY",
      size: buySize,
    };

    const buyResult = await executeMarketOrder(clobClient, buyRequest);

    if (!buyResult.success) {
      return {
        step: "Trade on Polymarket",
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

    // Wait a moment before selling
    await new Promise((r) => setTimeout(r, 2000));

    // SELL the tokens we just bought
    console.log(
      `  ${colors.cyan}Selling ${buyResult.filledSize.toFixed(
        2
      )} YES tokens...${colors.reset}`
    );
    const sellRequest: PolymarketOrderRequest = {
      tokenId: yesTokenId,
      side: "SELL",
      size: buyResult.filledSize,
    };

    const sellResult = await executeMarketOrder(clobClient, sellRequest);

    if (!sellResult.success) {
      console.warn(
        `  ${colors.yellow}⚠ Sell failed: ${sellResult.error}${colors.reset}`
      );
      console.log(`  You still hold ${buyResult.filledSize.toFixed(2)} tokens`);
      return {
        step: "Trade on Polymarket",
        success: false,
        duration: Date.now() - startTime,
        error: `Sell failed: ${sellResult.error}`,
        data: {
          market: marketTitle,
          buy_filled: buyResult.filledSize,
          buy_price: buyResult.avgPrice,
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

    // Calculate P&L
    const buyCost = buyResult.filledSize * buyResult.avgPrice;
    const sellProceeds = sellResult.filledSize * sellResult.avgPrice;
    const pnl = sellProceeds - buyCost;

    console.log();
    console.log(`  Buy cost:     $${buyCost.toFixed(4)}`);
    console.log(`  Sell proceeds: $${sellProceeds.toFixed(4)}`);
    console.log(
      `  P&L:          ${pnl >= 0 ? colors.green : colors.red}$${pnl.toFixed(
        4
      )}${colors.reset}`
    );
    console.log(`  Duration: ${formatDuration(Date.now() - startTime)}`);
    console.log();

    return {
      step: "Trade on Polymarket",
      success: true,
      duration: Date.now() - startTime,
      data: {
        market: marketTitle,
        buy_order_id: buyResult.orderId,
        buy_filled: buyResult.filledSize,
        buy_price: buyResult.avgPrice,
        sell_order_id: sellResult.orderId,
        sell_filled: sellResult.filledSize,
        sell_price: sellResult.avgPrice,
        pnl,
      },
    };
  } catch (error) {
    console.error(`  ${colors.red}✗ Trade error:${colors.reset}`, error);
    return {
      step: "Trade on Polymarket",
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Step 3: Withdraw (Polygon → Solana) - REMOVED
// Use scripts/checkBridge.ts for bridging instead
// ============================================================================

// ============================================================================
// Full Test (Deposit + Trade)
// ============================================================================

async function runFullTest(amount: number): Promise<void> {
  console.log("═".repeat(60));
  console.log("  🎰 Polymarket Tool Checker - Full Test");
  console.log("═".repeat(60));
  console.log();
  console.log(
    `  ${colors.yellow}⚠ WARNING: This script moves REAL MONEY!${colors.reset}`
  );
  console.log(`  ${colors.cyan}Amount: $${amount}${colors.reset}`);
  console.log();

  const { svmSigner, svmPublicKey, evmPublicKey, sponsorSigner } =
    await setupWallets();

  const results: StepResult[] = [];

  // Check initial balances
  console.log("═".repeat(60));
  console.log("  Step 0: Check Initial Balances");
  console.log("═".repeat(60));

  const initialSolanaBalance = await getSolanaBalance(svmPublicKey);
  const initialPolygonBalance = await getPolygonBalance(evmPublicKey);

  console.log(`  Solana USDC:  $${initialSolanaBalance.toFixed(2)}`);
  console.log(`  Polygon USDC: $${initialPolygonBalance.toFixed(2)}`);
  console.log();

  if (initialSolanaBalance < amount) {
    console.error(
      `${
        colors.red
      }✗ Insufficient Solana balance. Have: $${initialSolanaBalance.toFixed(
        2
      )}, Need: $${amount}${colors.reset}`
    );
    process.exit(1);
  }

  // Step 1: Deposit
  const depositResult = await runDeposit(
    amount,
    svmSigner,
    evmPublicKey,
    sponsorSigner
  );
  results.push(depositResult);

  if (!depositResult.success) {
    printSummary(results);
    process.exit(1);
  }

  // Step 2: Trade (buy $5, sell immediately)
  const tradeResult = await runTrade(5, process.env.WALLET_GPT_EVM_PRIVATE!);
  results.push(tradeResult);

  // Final balances
  console.log("═".repeat(60));
  console.log("  Final Balances");
  console.log("═".repeat(60));

  const finalSolanaBalance = await getSolanaBalance(svmPublicKey);
  const finalPolygonBalance = await getPolygonBalance(evmPublicKey);

  console.log(`  Final Solana USDC:  $${finalSolanaBalance.toFixed(2)}`);
  console.log(`  Final Polygon USDC: $${finalPolygonBalance.toFixed(2)}`);
  console.log();
  console.log(
    `  ${colors.cyan}TIP: Use 'bun scripts/checkBridge.ts --to-solana' to bridge back${colors.reset}`
  );
  console.log();

  printSummary(results);
}

// ============================================================================
// Wallet Setup
// ============================================================================

async function setupWallets() {
  const svmPrivateKey = process.env.WALLET_GPT_SVM_PRIVATE;
  const svmPublicKey = process.env.WALLET_GPT_SVM_PUBLIC;
  const evmPrivateKey = process.env.WALLET_GPT_EVM_PRIVATE;
  const evmPublicKey = process.env.WALLET_GPT_EVM_PUBLIC;

  if (!svmPrivateKey || !svmPublicKey) {
    console.error(
      `${colors.red}✗ Missing WALLET_GPT_SVM_PRIVATE or WALLET_GPT_SVM_PUBLIC${colors.reset}`
    );
    process.exit(1);
  }

  if (!evmPrivateKey || !evmPublicKey) {
    console.error(
      `${colors.red}✗ Missing WALLET_GPT_EVM_PRIVATE or WALLET_GPT_EVM_PUBLIC${colors.reset}`
    );
    process.exit(1);
  }

  console.log(`  Solana wallet: ${svmPublicKey.slice(0, 8)}...`);
  console.log(`  Polygon wallet: ${evmPublicKey.slice(0, 10)}...`);

  const sponsorSigner = await getSponsorSigner();
  if (sponsorSigner) {
    console.log(
      `  ${colors.green}✓${
        colors.reset
      } Gas sponsor: ${sponsorSigner.address.slice(0, 8)}...`
    );
  } else {
    console.log(
      `  ${colors.yellow}○${colors.reset} No gas sponsor (agent pays own fees)`
    );
  }
  console.log();

  const svmSigner = await createSignerFromBase58SecretKey(svmPrivateKey);
  const evmWallet = createPolygonWallet(evmPrivateKey);

  return {
    svmSigner,
    evmWallet,
    svmPublicKey,
    evmPublicKey,
    evmPrivateKey,
    sponsorSigner,
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
Polymarket Tool Checker

Tests Polymarket trading on Polygon:

Modes:
  --deposit   Bridge USDC from Solana to Polygon (Polymarket bridge)
  --trade     Buy and sell on Polymarket (requires Polygon balance)
  (no flag)   Run all steps: deposit → trade

For bridging back to Solana, use: bun scripts/checkBridge.ts --to-solana

Usage:
  bun scripts/checkPolymarket.ts [--deposit|--trade] [amount]

Arguments:
  amount    Amount in USD (default: 10 for deposit, 5 for trade)

Examples:
  bun scripts/checkPolymarket.ts                # Full test: deposit $10, trade $5
  bun scripts/checkPolymarket.ts --deposit 20   # Deposit $20 to Polygon
  bun scripts/checkPolymarket.ts --trade 5      # Buy & sell $5 on Polymarket  

Environment variables required:
  WALLET_GPT_SVM_PRIVATE   Solana wallet private key (base58)
  WALLET_GPT_SVM_PUBLIC    Solana wallet public key
  WALLET_GPT_EVM_PRIVATE   Polygon wallet private key (hex)
  WALLET_GPT_EVM_PUBLIC    Polygon wallet address

⚠ WARNING: This script moves REAL MONEY!
`);
  process.exit(0);
}

// Parse mode and amount
const isDeposit = args.includes("--deposit");
const isTrade = args.includes("--trade");
const isFullTest = !isDeposit && !isTrade;

// Get amount from non-flag args
const amountArg = args.find((a) => !a.startsWith("--"));
const defaultAmount = isTrade ? 5 : 10;
const amount = Math.max(1, parseInt(amountArg || String(defaultAmount), 10));

async function main() {
  if (isFullTest) {
    await runFullTest(amount);
  } else {
    const {
      svmSigner,
      svmPublicKey,
      evmPublicKey,
      evmPrivateKey,
      sponsorSigner,
    } = await setupWallets();

    const results: StepResult[] = [];

    if (isDeposit) {
      const result = await runDeposit(
        amount,
        svmSigner,
        evmPublicKey,
        sponsorSigner
      );
      results.push(result);
    }

    if (isTrade) {
      const result = await runTrade(amount, evmPrivateKey);
      results.push(result);
    }

    printSummary(results);

    const failed = results.filter((r) => !r.success).length;
    if (failed > 0) process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
