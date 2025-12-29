"use workflow";

import { createHook, sleep } from "workflow";
import { tradingAgentWorkflow, type TradingResult } from "./tradingAgent";

// ============================================================================
// Types
// ============================================================================

export interface SignalListenerInput {
  modelId: string;
  walletAddress: string;
}

/** Market signal from PartyKit relay */
export interface MarketSignal {
  type: "price_swing" | "volume_spike" | "orderbook_imbalance";
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
}

interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

// ============================================================================
// Signal Listener Workflow
// ============================================================================

/**
 * Long-running workflow that listens for market signals via hooks.
 * One instance per model - uses deterministic token for signal routing.
 */
export async function signalListenerWorkflow(
  input: SignalListenerInput,
): Promise<void> {
  const { modelId, walletAddress } = input;

  console.log(`[signalListener:${modelId}] Starting signal listener workflow`);

  // Create hook with deterministic token for this model
  // External systems can resume this hook using: resumeHook(`signals:${modelId}`, signal)
  const signalHook = createHook<MarketSignal>({
    token: `signals:${modelId}`,
  });

  // Long-running loop - waits for signals from PartyKit
  for await (const signal of signalHook) {
    console.log(
      `[signalListener:${modelId}] Received signal: ${signal.type} for ${signal.ticker}`,
    );

    try {
      // Process the signal by delegating to tradingAgentWorkflow
      const result = await processSignal(modelId, walletAddress, signal);

      console.log(
        `[signalListener:${modelId}] Processed signal: ${result.trades.length} trades, ${result.steps} steps, decision: ${result.decision}`,
      );
    } catch (error) {
      console.error(
        `[signalListener:${modelId}] Error processing signal:`,
        error,
      );
      // Continue listening even if one signal fails
    }

    // Small delay to prevent tight loops if signals come rapidly
    await sleep("1s");
  }

  // This should never be reached unless the hook is explicitly closed
  console.log(`[signalListener:${modelId}] Signal listener ended`);
}

// ============================================================================
// Signal Processing
// ============================================================================

async function processSignal(
  modelId: string,
  walletAddress: string,
  signal: MarketSignal,
): Promise<TradingResult> {
  "use step";

  // Convert signal to price swing format
  const priceSwing = signalToPriceSwing(signal);

  // Delegate to tradingAgentWorkflow - it handles:
  // - Session management (durable)
  // - Market context fetching (durable)
  // - PredictionMarketAgent execution (durable wrapper, agent is NOT durable)
  // - Order fill waiting (durable)
  // - Database recording (durable, triggers Supabase Realtime)
  const result = await tradingAgentWorkflow({
    modelId,
    walletAddress,
    priceSwings: [priceSwing],
    signal,
  });

  return result;
}

/**
 * Convert a market signal to the PriceSwing format for the agent prompt.
 */
function signalToPriceSwing(signal: MarketSignal): PriceSwing {
  switch (signal.type) {
    case "price_swing":
      return {
        ticker: signal.ticker,
        previousPrice: signal.data.previousPrice as number,
        currentPrice: signal.data.currentPrice as number,
        changePercent: signal.data.changePercent as number,
      };

    case "volume_spike":
      // Volume spike - agent will fetch current prices
      return {
        ticker: signal.ticker,
        previousPrice: 0,
        currentPrice: 0,
        changePercent: 0,
      };

    case "orderbook_imbalance":
      // Orderbook imbalance - agent will analyze current state
      return {
        ticker: signal.ticker,
        previousPrice: 0,
        currentPrice: 0,
        changePercent: 0,
      };

    default:
      return {
        ticker: signal.ticker,
        previousPrice: 0,
        currentPrice: 0,
        changePercent: 0,
      };
  }
}
