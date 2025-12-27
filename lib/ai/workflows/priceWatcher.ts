"use workflow";

/**
 * @deprecated This workflow has been replaced by the PartyKit WebSocket relay.
 *
 * The new implementation uses PartyKit to maintain a persistent WebSocket
 * connection to dflow's market data stream, which is more efficient than
 * polling from Vercel serverless functions.
 *
 * See: party/dflow-relay.ts
 * API: /api/signals/trigger
 *
 * This file is kept for reference and backwards compatibility.
 */

import { sleep } from "workflow";
import { start } from "workflow/api";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
import { TRADING_CONFIG } from "@/lib/config";
import { tradingAgentWorkflow } from "./tradingAgent";

// ============================================================================
// Types
// ============================================================================

interface PriceData {
  ticker: string;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
}

interface PriceState {
  lastMid: number;
  lastUpdate: number;
}

interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

// ============================================================================
// Configuration
// ============================================================================

const SWING_THRESHOLD = TRADING_CONFIG.swingThreshold;
const POLL_INTERVAL = "10s";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// ============================================================================
// Price Watcher Workflow
// ============================================================================

/**
 * Long-lived workflow that polls for price updates and triggers agents.
 * Runs indefinitely with durable sleep between polls.
 */
export async function priceWatcherWorkflow() {
  // Price cache persisted across workflow suspensions
  const priceCache = new Map<string, PriceState>();

  console.log("[priceWatcher] Starting price watcher workflow");

  while (true) {
    try {
      // Step 1: Fetch current prices
      const prices = await fetchPrices();

      if (prices.length > 0) {
        // Step 2: Detect significant price swings
        const swings = detectSwings(prices, priceCache);

        // Step 3: If swings detected, trigger agent workflows
        if (swings.length > 0) {
          console.log(`[priceWatcher] Detected ${swings.length} price swings`);
          await triggerAgents(swings);
        }

        // Step 4: Update price cache
        for (const price of prices) {
          const mid = (price.yesBid + price.yesAsk) / 2;
          priceCache.set(price.ticker, {
            lastMid: mid,
            lastUpdate: Date.now(),
          });
        }

        // Step 5: Save to database for historical charts
        await savePriceHistory(prices);
      }
    } catch (error) {
      console.error("[priceWatcher] Error in poll cycle:", error);
      // Continue polling even on errors
    }

    // Durable sleep - workflow suspends here, no compute cost
    await sleep(POLL_INTERVAL);
  }
}

// ============================================================================
// Step Functions
// ============================================================================

async function fetchPrices(): Promise<PriceData[]> {
  "use step";

  try {
    const response = await fetch(`${BASE_URL}/api/dflow/markets`);

    if (!response.ok) {
      console.error(`[priceWatcher] Failed to fetch prices: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((m: Record<string, unknown>) => ({
      ticker: m.ticker as string,
      yesBid: parseFloat(m.yes_price as string) || 0.5,
      yesAsk: parseFloat(m.yes_price as string) || 0.5,
      noBid: parseFloat(m.no_price as string) || 0.5,
      noAsk: parseFloat(m.no_price as string) || 0.5,
    }));
  } catch (error) {
    console.error("[priceWatcher] Error fetching prices:", error);
    return [];
  }
}

function detectSwings(
  prices: PriceData[],
  cache: Map<string, PriceState>
): PriceSwing[] {
  const swings: PriceSwing[] = [];

  for (const price of prices) {
    const currentMid = (price.yesBid + price.yesAsk) / 2;
    const prev = cache.get(price.ticker);

    if (prev && prev.lastMid > 0) {
      const change = Math.abs(currentMid - prev.lastMid) / prev.lastMid;

      if (change >= SWING_THRESHOLD) {
        swings.push({
          ticker: price.ticker,
          previousPrice: prev.lastMid,
          currentPrice: currentMid,
          changePercent: change,
        });
      }
    }
  }

  return swings;
}

async function triggerAgents(swings: PriceSwing[]): Promise<void> {
  "use step";

  const models = getModelsWithWallets();

  // Start a trading workflow for each model (parallel)
  await Promise.all(
    models.map((model) =>
      start(tradingAgentWorkflow, [
        {
          modelId: model.id,
          walletAddress: model.walletAddress!,
          priceSwings: swings,
        },
      ])
    )
  );
}

async function savePriceHistory(prices: PriceData[]): Promise<void> {
  "use step";

  try {
    await fetch(`${BASE_URL}/api/prices/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prices: prices.map((p) => ({
          ticker: p.ticker,
          yesMid: (p.yesBid + p.yesAsk) / 2,
          recordedAt: new Date().toISOString(),
        })),
      }),
    });
  } catch (error) {
    // Silently fail - price history is optional
    console.error("[priceWatcher] Failed to save price history:", error);
  }
}
