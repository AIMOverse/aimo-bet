// ============================================================================
// Tool Availability Checker Script
// Tests all AI agent tools by invoking them with sample inputs
// Usage: bun scripts/checkTools.ts
// ============================================================================

// Load environment variables FIRST
import "dotenv/config";

import { setTimeout } from "timers/promises";

// Direct imports for testing (bypassing AI SDK tool wrapper)
import { getCurrencyBalance } from "@/lib/crypto/solana/client";
import { getUserPositions } from "@/lib/prediction-market/kalshi/dflow/prediction-markets/retrieve";
import { fetchEvents } from "@/lib/prediction-market/kalshi/dflow/prediction-markets/discover";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";
import { assertResponseOk } from "@/lib/prediction-market/kalshi/dflow/utils";
import { search } from "@/lib/parallel/client";

// ============================================================================
// Types
// ============================================================================

interface ToolTestResult {
  name: string;
  success: boolean;
  duration: number;
  result?: unknown;
  error?: string;
}

interface TestConfig {
  skipDestructive?: boolean; // Skip placeOrder
  skipAsync?: boolean; // Skip deepResearch (async webhook)
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

function log(
  color: keyof typeof colors,
  prefix: string,
  message: string
): void {
  console.log(`${colors[color]}[${prefix}]${colors.reset} ${message}`);
}

// ============================================================================
// Environment Variable Check
// ============================================================================

function checkEnvVars(): void {
  console.log("\n📋 Environment Variables Check\n");

  const requiredVars = [
    { name: "DFLOW_API_KEY", required: true, description: "dflow API access" },
    {
      name: "PARALLEL_API_KEY",
      required: false,
      description: "Parallel AI search/research",
    },
    {
      name: "WALLET_GPT_SVM_PUBLIC",
      required: false,
      description: "Sample wallet for balance check",
    },
  ];

  const optionalVars = [
    { name: "POLYGON_RPC_URL", description: "Polygon RPC for Polymarket" },
    { name: "POLYGON_PRIVATE_KEY", description: "Polygon wallet for trading" },
    { name: "PARALLEL_WEBHOOK_SECRET", description: "Webhook verification" },
  ];

  let missingRequired = 0;

  for (const v of requiredVars) {
    const value = process.env[v.name];
    if (value) {
      log("green", "✓", `${v.name} - ${v.description}`);
    } else if (v.required) {
      log("red", "✗", `${v.name} - MISSING (required for ${v.description})`);
      missingRequired++;
    } else {
      log("yellow", "○", `${v.name} - Not set (${v.description})`);
    }
  }

  console.log("\n  Optional variables:");
  for (const v of optionalVars) {
    const value = process.env[v.name];
    if (value) {
      log("gray", "  ✓", `${v.name}`);
    } else {
      log("gray", "  ○", `${v.name} - Not set`);
    }
  }

  if (missingRequired > 0) {
    console.log(
      `\n${colors.red}⚠ ${missingRequired} required env vars missing${colors.reset}\n`
    );
  } else {
    console.log(
      `\n${colors.green}✓ All required env vars present${colors.reset}\n`
    );
  }
}

// ============================================================================
// Tool Tests - Direct API calls (bypassing AI SDK tool wrapper)
// ============================================================================

/**
 * Test getBalance tool logic
 * Directly calls the underlying Solana balance fetcher
 */
async function testGetBalance(): Promise<ToolTestResult> {
  const name = "getBalance";
  const start = Date.now();

  try {
    // Get a sample wallet address from env
    const walletAddress =
      process.env.WALLET_GPT_SVM_PUBLIC ||
      process.env.WALLET_CLAUDE_SVM_PUBLIC ||
      // Fallback to a known public address for testing (read-only)
      "DfFgBk1qN5kYDDfz5P2NTZ4nDLaFcZx9oXSRHUAKMn1a";

    // Directly call the balance fetcher (same as tool internally does)
    const result = await getCurrencyBalance(walletAddress, "USDC");

    const balance = result ? Number(result.formatted) : 0;

    return {
      name,
      success: true,
      duration: Date.now() - start,
      result: {
        total_balance: balance,
        balances: {
          kalshi: {
            chain: "solana",
            wallet: walletAddress,
            balance,
            currency: "USDC",
          },
        },
      },
    };
  } catch (error) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test getPositions tool logic
 * Directly calls the underlying position retriever
 */
async function testGetPositions(): Promise<ToolTestResult> {
  const name = "getPositions";
  const start = Date.now();

  try {
    const walletAddress =
      process.env.WALLET_GPT_SVM_PUBLIC ||
      process.env.WALLET_CLAUDE_SVM_PUBLIC ||
      "DfFgBk1qN5kYDDfz5P2NTZ4nDLaFcZx9oXSRHUAKMn1a";

    // Directly call the position retriever
    const result = await getUserPositions(walletAddress);

    return {
      name,
      success: true,
      duration: Date.now() - start,
      result: {
        position_count: result.positions.length,
        summary: {
          total_positions: result.positions.length,
          active_positions: result.positions.filter((p) => !p.market?.result)
            .length,
          closed_positions: result.positions.filter((p) => p.market?.result)
            .length,
        },
      },
    };
  } catch (error) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test discoverMarkets tool logic
 * Directly calls the underlying dflow events endpoint
 */
async function testDiscoverMarkets(): Promise<ToolTestResult> {
  const name = "discoverMarkets";
  const start = Date.now();

  try {
    // Directly call dflow events endpoint
    const eventsResponse = await fetchEvents({
      withNestedMarkets: true,
      status: "active",
      limit: 5,
    });

    const markets = eventsResponse.events.flatMap((event) =>
      (event.markets ?? []).map((market) => ({
        source: "kalshi",
        id: market.ticker,
        question: market.title,
        volume_24h: market.volume,
        status: market.status,
      }))
    );

    return {
      name,
      success: true,
      duration: Date.now() - start,
      result: {
        market_count: markets.length,
        has_more: eventsResponse.events.length >= 5,
        source_breakdown: {
          kalshi: markets.length,
          polymarket: 0,
        },
        sample_market: markets[0]
          ? {
              id: markets[0].id,
              question: markets[0].question?.slice(0, 50) + "...",
            }
          : null,
      },
    };
  } catch (error) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test explainMarket tool logic
 * Directly calls the underlying dflow market/event/orderbook endpoints
 */
async function testExplainMarket(): Promise<ToolTestResult> {
  const name = "explainMarket";
  const start = Date.now();

  try {
    // First discover a market to get a valid ID
    const eventsResponse = await fetchEvents({
      withNestedMarkets: true,
      status: "active",
      limit: 1,
    });

    const firstMarket = eventsResponse.events[0]?.markets?.[0];
    if (!firstMarket) {
      return {
        name,
        success: false,
        duration: Date.now() - start,
        error: "No markets available to explain",
      };
    }

    const marketTicker = firstMarket.ticker;

    // Fetch market details
    const marketResponse = await dflowMetadataFetch(`/market/${marketTicker}`);
    await assertResponseOk(marketResponse, "fetch market");
    const market = (await marketResponse.json()) as {
      ticker: string;
      title: string;
      subtitle?: string;
      eventTicker?: string;
      status: string;
      result?: string;
      accounts: Record<string, { yesMint: string; noMint: string }>;
    };

    // Fetch orderbook
    let orderbookStatus = "none";
    try {
      const orderbookResponse = await dflowMetadataFetch(
        `/orderbook/${marketTicker}`
      );
      if (orderbookResponse.ok) {
        const orderbook = (await orderbookResponse.json()) as {
          bids: Array<{ price: number; quantity: number }>;
          asks: Array<{ price: number; quantity: number }>;
        };
        orderbookStatus = `${orderbook.bids?.length ?? 0} bids, ${
          orderbook.asks?.length ?? 0
        } asks`;
      }
    } catch {
      // Orderbook fetch failed, continue
    }

    // Get trading info
    const accountEntries = Object.entries(market.accounts);
    const [, accounts] = accountEntries[0] ?? [
      null,
      { yesMint: "", noMint: "" },
    ];

    // Determine status
    let status: "active" | "closed" | "resolved" = "active";
    if (market.status === "determined" || market.result) {
      status = "resolved";
    } else if (market.status !== "active") {
      status = "closed";
    }

    return {
      name,
      success: true,
      duration: Date.now() - start,
      result: {
        market_id: market.ticker,
        question: market.title?.slice(0, 50) + "...",
        status,
        orderbook: orderbookStatus,
        trading_info: {
          market_ticker: market.ticker,
          yes_mint: accounts.yesMint,
          no_mint: accounts.noMint,
        },
      },
    };
  } catch (error) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test webSearch tool logic
 * Directly calls the Parallel search API
 */
async function testWebSearch(): Promise<ToolTestResult> {
  const name = "webSearch";
  const start = Date.now();

  try {
    // Check if PARALLEL_API_KEY is set
    if (!process.env.PARALLEL_API_KEY) {
      return {
        name,
        success: false,
        duration: Date.now() - start,
        error: "PARALLEL_API_KEY not configured",
      };
    }

    // Directly call search API
    const result = await search({
      objective: "Find news from the past week about: Bitcoin price prediction",
      queries: ["Bitcoin BTC latest news"],
      maxResults: 3,
    });

    return {
      name,
      success: true,
      duration: Date.now() - start,
      result: {
        search_id: result.search_id,
        result_count: result.results.length,
        sample_result: result.results[0]
          ? {
              title: result.results[0].title?.slice(0, 50) + "...",
              url: result.results[0].url,
            }
          : null,
      },
    };
  } catch (error) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test deepResearch tool (async - doesn't wait for completion)
 */
async function testDeepResearch(skip: boolean): Promise<ToolTestResult> {
  const name = "deepResearch";
  const start = Date.now();

  if (skip) {
    return {
      name,
      success: true,
      duration: 0,
      result: { skipped: true, reason: "Async tool - skipped by config" },
    };
  }

  try {
    if (!process.env.PARALLEL_API_KEY) {
      return {
        name,
        success: false,
        duration: Date.now() - start,
        error: "PARALLEL_API_KEY not configured",
      };
    }

    const { createResearchTask } = await import("@/lib/parallel/client");

    // Use the cheapest processor for testing
    const result = await createResearchTask({
      input:
        "What is the current state of Bitcoin ETF adoption? (Test query - minimal research)",
      processor: "lite-fast",
    });

    return {
      name,
      success: true,
      duration: Date.now() - start,
      result: {
        run_id: result.run_id,
        status: "pending",
        message: "Research task submitted. Results delivered via webhook.",
      },
    };
  } catch (error) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test placeOrder tool (dry run - doesn't execute real trade)
 */
async function testPlaceOrder(skip: boolean): Promise<ToolTestResult> {
  const name = "placeOrder";
  const start = Date.now();

  if (skip) {
    return {
      name,
      success: true,
      duration: 0,
      result: { skipped: true, reason: "Destructive tool - skipped by config" },
    };
  }

  try {
    // Check for wallet private key
    const privateKey = process.env.WALLET_GPT_SVM_PRIVATE;
    if (!privateKey) {
      return {
        name,
        success: false,
        duration: Date.now() - start,
        error:
          "No wallet private key configured (WALLET_GPT_SVM_PRIVATE). Cannot test placeOrder without signing capability.",
      };
    }

    // Import tool factory
    const { createPlaceOrderTool } = await import("@/lib/ai/tools/trade");
    const { createSignerFromBase58SecretKey } = await import(
      "@/lib/crypto/solana/wallets"
    );

    const walletAddress = process.env.WALLET_GPT_SVM_PUBLIC!;
    const signer = await createSignerFromBase58SecretKey(privateKey);

    const tool = createPlaceOrderTool(walletAddress, signer, undefined);

    // NOTE: This would execute a real trade!
    // For testing, we verify the tool can be created but don't execute
    return {
      name,
      success: true,
      duration: Date.now() - start,
      result: {
        skipped: true,
        reason:
          "Tool created successfully but execution skipped (would place real order)",
        tool_created: !!tool,
      },
    };
  } catch (error) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function runAllTests(config: TestConfig = {}): Promise<void> {
  console.log("═".repeat(60));
  console.log("  🔧 Tool Availability Checker");
  console.log("═".repeat(60));

  // Check environment variables first
  checkEnvVars();

  console.log("═".repeat(60));
  console.log("  Running Tool Tests");
  console.log("═".repeat(60));
  console.log();

  const results: ToolTestResult[] = [];

  // Run tests sequentially with small delays to avoid rate limiting
  const tests = [
    { name: "getBalance", fn: () => testGetBalance() },
    { name: "getPositions", fn: () => testGetPositions() },
    { name: "discoverMarkets", fn: () => testDiscoverMarkets() },
    { name: "explainMarket", fn: () => testExplainMarket() },
    { name: "webSearch", fn: () => testWebSearch() },
    {
      name: "deepResearch",
      fn: () => testDeepResearch(config.skipAsync ?? true),
    },
    {
      name: "placeOrder",
      fn: () => testPlaceOrder(config.skipDestructive ?? true),
    },
  ];

  for (const test of tests) {
    process.stdout.write(`  Testing ${test.name}... `);

    try {
      const result = await test.fn();
      results.push(result);

      if (result.success) {
        console.log(`${colors.green}✓${colors.reset} (${result.duration}ms)`);
      } else {
        console.log(`${colors.red}✗${colors.reset} (${result.duration}ms)`);
      }

      // Small delay between tests
      await setTimeout(100);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      results.push({
        name: test.name,
        success: false,
        duration: 0,
        error: errorMessage,
      });
      console.log(`${colors.red}✗${colors.reset} (error)`);
    }
  }

  // Print detailed results
  console.log("\n" + "═".repeat(60));
  console.log("  Detailed Results");
  console.log("═".repeat(60) + "\n");

  for (const result of results) {
    const statusIcon = result.success
      ? `${colors.green}✓${colors.reset}`
      : `${colors.red}✗${colors.reset}`;

    console.log(`${statusIcon} ${result.name} (${result.duration}ms)`);

    if (result.result) {
      console.log(`  ${colors.gray}Result:${colors.reset}`);
      const resultStr = JSON.stringify(result.result, null, 2)
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      console.log(resultStr);
    }

    if (result.error) {
      console.log(`  ${colors.red}Error: ${result.error}${colors.reset}`);
    }

    console.log();
  }

  // Summary
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("═".repeat(60));
  console.log(`  Summary: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.log(
      `\n${colors.yellow}Note: Some failures may be expected (missing env vars, network issues).${colors.reset}`
    );
    console.log(
      `${colors.yellow}Re-run this script to verify network-related failures.${colors.reset}\n`
    );
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2);
const config: TestConfig = {
  skipDestructive: !args.includes("--with-trade"),
  skipAsync: !args.includes("--with-research"),
};

if (args.includes("--help")) {
  console.log(`
Tool Availability Checker

Usage: bun scripts/checkTools.ts [options]

Options:
  --with-trade     Include placeOrder test (will create real order!)
  --with-research  Include deepResearch test (async, costs money)
  --help           Show this help message

By default, destructive (placeOrder) and async (deepResearch) tests are skipped.
`);
  process.exit(0);
}

runAllTests(config).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
