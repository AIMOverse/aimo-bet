"use workflow";

import { getWritable, sleep } from "workflow";
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

interface TradingInput {
  modelId: string;
  walletAddress: string;
  priceSwings: PriceSwing[];
}

interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

interface StreamChunk {
  type: "reasoning" | "tool_call" | "trade" | "complete";
  text?: string;
  toolName?: string;
  trade?: {
    ticker: string;
    side: string;
    quantity: number;
    price: number;
  };
}

/**
 * Workflow writable stream interface.
 * At runtime, getWritable() returns this type, but TypeScript sees WritableStream.
 */
interface WorkflowWritable<T> {
  write(chunk: T): void;
  close(): void;
}

interface TradingResult {
  reasoning: string;
  trades: Trade[];
  steps: number;
}

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// ============================================================================
// Trading Agent Workflow
// ============================================================================

/**
 * Executes a trading agent with streaming output.
 * Each agent run is a separate workflow instance.
 */
export async function tradingAgentWorkflow(
  input: TradingInput,
): Promise<TradingResult> {
  // Get writable stream for real-time updates to frontend
  // Cast needed because workflow runtime types aren't visible to TypeScript
  const stream =
    getWritable<StreamChunk>() as unknown as WorkflowWritable<StreamChunk>;

  console.log(`[tradingAgent:${input.modelId}] Starting trading workflow`);

  try {
    // Step 1: Get session
    const session = await getSession();

    // Step 2: Fetch market context
    const context = await fetchContext(input.walletAddress);

    // Step 3: Run agent with streaming
    const result = await runAgent(input, context, session.id, stream);

    // Step 4: Wait for any pending order fills
    if (result.trades.length > 0) {
      await waitForFills(result.trades);
    }

    // Step 5: Broadcast final summary
    await broadcastSummary(session.id, input.modelId, result);

    stream.write({ type: "complete" });
    stream.close();

    return result;
  } catch (error) {
    console.error(`[tradingAgent:${input.modelId}] Error:`, error);
    stream.close();
    throw error;
  }
}

// ============================================================================
// Step Functions
// ============================================================================

async function getSession() {
  "use step";
  return await getGlobalSession();
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

async function fetchContext(walletAddress: string): Promise<MarketContext> {
  "use step";

  // Fetch balance
  let cashBalance = 0;
  try {
    const balanceRes = await fetch(
      `${BASE_URL}/api/solana/balance?wallet=${walletAddress}`,
    );
    if (balanceRes.ok) {
      const balanceData = await balanceRes.json();
      cashBalance = parseFloat(balanceData.formatted) || 0;
    }
  } catch (error) {
    console.error("[tradingAgent] Failed to fetch balance:", error);
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
    console.error("[tradingAgent] Failed to fetch markets:", error);
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

async function runAgent(
  input: TradingInput,
  context: MarketContext,
  sessionId: string,
  stream: WorkflowWritable<StreamChunk>,
): Promise<TradingResult> {
  "use step";

  // Create model with guardrails middleware
  const baseModel = getModel(input.modelId);
  const model = wrapLanguageModel({
    model: baseModel,
    middleware: createTradingMiddleware({
      maxTokens: 4096,
      maxToolCalls: 20,
      maxTradesPerRun: 3,
      modelId: input.modelId,
    }),
  });

  // Create tools with wallet context
  const privateKey = getWalletPrivateKey(input.modelId);
  const tools = createAgentTools(input.walletAddress, privateKey);

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
    priceSwings: input.priceSwings,
  };
  const contextPrompt = buildContextPrompt(promptInput);

  // Execute agentic loop
  const result = await generateText({
    model,
    system: TRADING_SYSTEM_PROMPT,
    prompt: contextPrompt,
    tools,
    stopWhen: stepCountIs(TRADING_CONFIG.maxStepsPerAgent),
    onStepFinish: (step) => {
      // Stream reasoning to frontend
      if (step.text) {
        stream.write({ type: "reasoning", text: step.text });
      }

      // Stream tool calls
      if (step.toolCalls) {
        for (const call of step.toolCalls) {
          stream.write({ type: "tool_call", toolName: call.toolName });

          // If it's a trade, stream the trade details
          if (call.toolName === "placeOrder") {
            const args =
              (call as { input?: Record<string, unknown> }).input || {};
            stream.write({
              type: "trade",
              trade: {
                ticker: args.market_ticker as string,
                side: args.side as string,
                quantity: args.quantity as number,
                price: (args.limit_price as number) || 0,
              },
            });
          }
        }
      }
    },
  });

  // Extract trades from results
  const trades = extractTrades(result.steps);

  return {
    reasoning: result.text || "No reasoning provided.",
    trades,
    steps: result.steps.length,
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
          (r) => r.toolCallId === call.toolCallId,
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
        console.error(`[tradingAgent] Error checking order status:`, error);
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
  result: TradingResult,
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
