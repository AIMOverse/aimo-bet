"use workflow";

import { createHook, sleep } from "workflow";
import {
  tradingAgentWorkflow,
  type TradingResult,
  type MarketSignal,
} from "./tradingAgent";

// ============================================================================
// Types
// ============================================================================

export interface SignalListenerInput {
  modelId: string;
  walletAddress: string;
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

  // Delegate to tradingAgentWorkflow - it handles:
  // - Session management (durable)
  // - Balance fetching (durable)
  // - PredictionMarketAgent execution (durable wrapper, agent is NOT durable)
  // - Order fill waiting (durable)
  // - Database recording (durable, triggers Supabase Realtime)
  const result = await tradingAgentWorkflow({
    modelId,
    walletAddress,
    signal,
  });

  return result;
}
