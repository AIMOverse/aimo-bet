"use workflow";

import { createHook, sleep } from "workflow";
import { generateText, wrapLanguageModel, stepCountIs } from "ai";
import { getModel } from "@/lib/ai/models";
import { getWalletPrivateKey } from "@/lib/ai/models/catalog";
import { createAgentTools } from "@/lib/ai/tools";
import { createTradingMiddleware } from "@/lib/ai/guardrails";
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/trading/systemPrompt";
import {
  buildContextPrompt,
  type ContextPromptInput,
} from "@/lib/ai/prompts/trading/contextBuilder";
import { getGlobalSession, saveChatMessage } from "@/lib/supabase/db";
import { TRADING_CONFIG } from "@/lib/config";
import { nanoid } from "nanoid";
import type {
  ChatMessage,
  ChatMessageType,
  PredictionMarket,
  Trade,
  PositionSide,
  TradeAction,
} from "@/lib/supabase/types";

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

interface TradingResult {
  reasoning: string;
  trades: Trade[];
  steps: number;
}

interface MarketContext {
  availableMarkets: PredictionMarket[];
  portfolio: {
    cashBalance: number;
    totalValue: number;
    positions: Array<{
      marketTicker: string;
      marketTitle: string;
      side: PositionSide;
      quantity: number;
    }>;
  };
  recentTrades: Trade[];
}

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// ============================================================================
// Signal Listener Workflow
// ============================================================================

/**
 * Long-running workflow that listens for market signals via hooks.
 * One instance per model - uses deterministic token for signal routing.
 */
export async function signalListenerWorkflow(
  input: SignalListenerInput
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
      `[signalListener:${modelId}] Received signal: ${signal.type} for ${signal.ticker}`
    );

    try {
      // Process the signal
      await processSignal(modelId, walletAddress, signal);
    } catch (error) {
      console.error(
        `[signalListener:${modelId}] Error processing signal:`,
        error
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
  signal: MarketSignal
): Promise<void> {
  "use step";

  // Step 1: Get session
  const session = await getGlobalSession();

  // Step 2: Fetch market context
  const context = await fetchContext(walletAddress);

  // Step 3: Convert signal to price swing format
  const priceSwing = signalToPriceSwing(signal);

  // Step 4: Run the trading agent
  const result = await runTradingAgent(
    modelId,
    walletAddress,
    context,
    [priceSwing],
    signal
  );

  // Step 5: Wait for any pending order fills
  if (result.trades.length > 0) {
    await waitForFills(result.trades);
  }

  // Step 6: Broadcast summary to chat
  await broadcastSummary(session.id, modelId, result);

  console.log(
    `[signalListener:${modelId}] Processed signal: ${result.trades.length} trades, ${result.steps} steps`
  );
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

// ============================================================================
// Trading Agent Execution
// ============================================================================

async function runTradingAgent(
  modelId: string,
  walletAddress: string,
  context: MarketContext,
  priceSwings: PriceSwing[],
  signal: MarketSignal
): Promise<TradingResult> {
  "use step";

  // Create model with guardrails middleware
  const baseModel = getModel(modelId);
  const model = wrapLanguageModel({
    model: baseModel,
    middleware: createTradingMiddleware({
      maxTokens: 4096,
      maxToolCalls: 20,
      maxTradesPerRun: 3,
      modelId,
    }),
  });

  // Create tools with wallet context
  const privateKey = getWalletPrivateKey(modelId);
  const tools = createAgentTools(walletAddress, privateKey);

  // Build context prompt
  const promptInput: ContextPromptInput = {
    availableMarkets: context.availableMarkets.map((m) => ({
      ticker: m.ticker,
      title: m.title,
      yesPrice: m.yesPrice,
      noPrice: m.noPrice,
      volume: m.volume,
      status: m.status,
    })),
    portfolio: {
      cashBalance: context.portfolio.cashBalance,
      totalValue: context.portfolio.totalValue,
      positions: context.portfolio.positions,
    },
    recentTrades: context.recentTrades.map((t) => ({
      marketTicker: t.marketTicker,
      side: t.side,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
    })),
    priceSwings,
    signal,
  };
  const contextPrompt = buildContextPrompt(promptInput);

  // Execute agentic loop
  const result = await generateText({
    model,
    system: TRADING_SYSTEM_PROMPT,
    prompt: contextPrompt,
    tools,
    stopWhen: stepCountIs(TRADING_CONFIG.maxStepsPerAgent),
  });

  // Extract trades from results
  const trades = extractTrades(result.steps);

  return {
    reasoning: result.text || "No reasoning provided.",
    trades,
    steps: result.steps.length,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchContext(walletAddress: string): Promise<MarketContext> {
  "use step";

  // Fetch balance
  let cashBalance = 0;
  try {
    const balanceRes = await fetch(
      `${BASE_URL}/api/solana/balance?wallet=${walletAddress}`
    );
    if (balanceRes.ok) {
      const balanceData = await balanceRes.json();
      cashBalance = parseFloat(balanceData.formatted) || 0;
    }
  } catch (error) {
    console.error("[signalListener] Failed to fetch balance:", error);
  }

  // Fetch markets
  let markets: PredictionMarket[] = [];
  try {
    const marketsRes = await fetch(`${BASE_URL}/api/dflow/markets`);
    if (marketsRes.ok) {
      const marketsData = await marketsRes.json();
      if (Array.isArray(marketsData)) {
        markets = marketsData.map((m: Record<string, unknown>) => ({
          ticker: m.ticker as string,
          title: (m.title as string) || (m.ticker as string),
          category: (m.category as string) || "Unknown",
          yesPrice: parseFloat(m.yes_price as string) || 0.5,
          noPrice: parseFloat(m.no_price as string) || 0.5,
          volume: parseFloat(m.volume as string) || 0,
          expirationDate: new Date(),
          status: (m.status as "open" | "closed" | "settled") || "open",
        }));
      }
    }
  } catch (error) {
    console.error("[signalListener] Failed to fetch markets:", error);
  }

  // Positions would be fetched from on-chain data
  const positions: MarketContext["portfolio"]["positions"] = [];

  return {
    availableMarkets: markets,
    portfolio: {
      cashBalance,
      totalValue: cashBalance,
      positions,
    },
    recentTrades: [],
  };
}

function extractTrades(steps: unknown[]): Trade[] {
  const trades: Trade[] = [];

  for (const step of steps) {
    const typedStep = step as {
      toolCalls?: Array<{
        toolName: string;
        toolCallId: string;
        input?: Record<string, unknown>;
      }>;
      toolResults?: Array<{
        toolCallId: string;
        output?: { success: boolean; order?: { id: string; price?: number } };
      }>;
    };

    if (!typedStep.toolCalls || !typedStep.toolResults) continue;

    for (const call of typedStep.toolCalls) {
      if (call.toolName === "placeOrder") {
        const result = typedStep.toolResults.find(
          (r) => r.toolCallId === call.toolCallId
        );

        if (result?.output?.success) {
          const args = call.input || {};
          trades.push({
            id: result.output.order?.id || nanoid(),
            portfolioId: "",
            marketTicker: args.market_ticker as string,
            marketTitle: args.market_ticker as string,
            side: args.side as PositionSide,
            action: args.action as TradeAction,
            quantity: args.quantity as number,
            price:
              result.output.order?.price || (args.limit_price as number) || 0,
            notional:
              (args.quantity as number) *
              (result.output.order?.price || (args.limit_price as number) || 0),
            createdAt: new Date(),
          });
        }
      }
    }
  }

  return trades;
}

async function waitForFills(trades: Trade[]): Promise<void> {
  "use step";

  for (const trade of trades) {
    // Poll for fill status with exponential backoff
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = await fetch(`${BASE_URL}/api/dflow/order/${trade.id}`);
        if (res.ok) {
          const status = await res.json();
          if (status.status === "filled" || status.status === "cancelled") {
            break;
          }
        }
      } catch (error) {
        console.error(`[signalListener] Error checking order status:`, error);
      }

      // Durable sleep with exponential backoff (5s, 10s, 20s, ...)
      const delay = Math.min(5 * Math.pow(2, attempt), 60);
      await sleep(`${delay}s`);
    }
  }
}

async function broadcastSummary(
  sessionId: string,
  modelId: string,
  result: TradingResult
): Promise<void> {
  "use step";

  const messageType: ChatMessageType =
    result.trades.length > 0 ? "trade" : "commentary";

  const message: ChatMessage = {
    id: nanoid(),
    role: "assistant",
    parts: [{ type: "text", text: result.reasoning }],
    metadata: {
      sessionId,
      authorType: "model",
      authorId: modelId,
      messageType,
      relatedTradeId: result.trades[0]?.id,
      createdAt: Date.now(),
    },
  };

  await saveChatMessage(message);
}
