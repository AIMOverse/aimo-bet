"use workflow";

import { getWritable, sleep } from "workflow";
import { DurableAgent } from "@workflow/ai";
import type { UIMessageChunk } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { getWalletPrivateKey } from "@/lib/ai/models/catalog";
import { createTradingMiddleware } from "@/lib/ai/guardrails";
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/trading/systemPrompt";
import {
  buildContextPrompt,
  type ContextPromptInput,
} from "@/lib/ai/prompts/trading/contextBuilder";
import { getGlobalSession } from "@/lib/supabase/db";
import {
  getOrCreateAgentSession,
  recordAgentDecision,
  recordAgentTrade,
  updateAgentSessionValue,
} from "@/lib/supabase/agents";
import { TRADING_CONFIG } from "@/lib/config";
import { nanoid } from "nanoid";
import { getModelName } from "@/lib/ai/models/catalog";
import type {
  PredictionMarket,
  Trade,
  PositionSide,
  TradeAction,
  TriggerType,
  DecisionType,
  AgentSession,
} from "@/lib/supabase/types";

// ============================================================================
// Types
// ============================================================================

export interface TradingInput {
  modelId: string;
  walletAddress: string;
  priceSwings: PriceSwing[];
  /** Optional: full signal data for richer context */
  signal?: MarketSignal;
}

interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

/** Market signal from PartyKit relay */
interface MarketSignal {
  type: "price_swing" | "volume_spike" | "orderbook_imbalance";
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface TradingResult {
  reasoning: string;
  trades: Trade[];
  steps: number;
  decision: DecisionType;
  confidence?: number;
  marketTicker?: string;
  marketTitle?: string;
  portfolioValue: number;
}

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// ============================================================================
// Durable Tools Factory
// ============================================================================

/**
 * Creates durable tools for the trading agent.
 * Each tool marked with "use step" is retryable and persistent.
 */
function createDurableTools(walletAddress: string, privateKey?: string) {
  return {
    getMarkets: {
      description:
        "Get list of prediction markets. Use to discover trading opportunities.",
      inputSchema: z.object({
        status: z
          .enum(["active", "inactive", "closed", "determined", "finalized"])
          .optional()
          .default("active")
          .describe("Filter by market status"),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Max markets to return"),
      }),
      execute: async function ({ status, limit }: { status?: string; limit?: number }) {
        "use step"; // Durable - retries on failure
        const params = new URLSearchParams();
        params.set("status", status || "active");
        params.set("limit", String(limit || 20));
        const res = await fetch(`${BASE_URL}/api/dflow/markets?${params}`);
        if (!res.ok) {
          return { success: false, error: `Failed: ${res.status}` };
        }
        const markets = await res.json();
        return { success: true, markets, count: markets.length };
      },
    },

    getMarketDetails: {
      description: "Get detailed information about a specific prediction market.",
      inputSchema: z.object({
        ticker: z.string().describe("Market ticker to get details for"),
      }),
      execute: async function ({ ticker }: { ticker: string }) {
        "use step"; // Durable - retries on failure
        const res = await fetch(`${BASE_URL}/api/dflow/markets/${ticker}`);
        if (!res.ok) {
          return { success: false, error: `Failed: ${res.status}` };
        }
        return { success: true, market: await res.json() };
      },
    },

    getLiveData: {
      description: "Get live price and orderbook data for a market.",
      inputSchema: z.object({
        ticker: z.string().describe("Market ticker to get live data for"),
      }),
      execute: async function ({ ticker }: { ticker: string }) {
        "use step"; // Durable - retries on failure
        const res = await fetch(`${BASE_URL}/api/dflow/markets/${ticker}/live`);
        if (!res.ok) {
          return { success: false, error: `Failed: ${res.status}` };
        }
        return { success: true, liveData: await res.json() };
      },
    },

    getBalance: {
      description: "Check wallet balance (USDC).",
      inputSchema: z.object({
        currency: z
          .enum(["USDC", "CASH"])
          .optional()
          .default("USDC")
          .describe("Settlement currency to check"),
      }),
      execute: async function ({ currency }: { currency?: string }) {
        "use step"; // Durable - retries on failure
        const params = new URLSearchParams();
        params.set("wallet", walletAddress);
        params.set("currency", currency || "USDC");
        const res = await fetch(`${BASE_URL}/api/solana/balance?${params}`);
        if (!res.ok) {
          return { success: false, error: `Failed: ${res.status}` };
        }
        const data = await res.json();
        return {
          success: true,
          wallet: data.wallet,
          balance: data.balance,
          formatted: data.formatted,
        };
      },
    },

    getPositions: {
      description: "Get current positions (outcome token holdings).",
      inputSchema: z.object({}),
      execute: async function () {
        "use step"; // Durable - retries on failure
        const res = await fetch(
          `${BASE_URL}/api/dflow/positions?wallet=${walletAddress}`
        );
        if (!res.ok) {
          return { success: true, wallet: walletAddress, positions: [], count: 0 };
        }
        const data = await res.json();
        return {
          success: true,
          wallet: walletAddress,
          positions: data.positions || [],
          count: data.positions?.length || 0,
        };
      },
    },

    getTradeHistory: {
      description: "Get recent trade history.",
      inputSchema: z.object({
        limit: z.number().optional().default(20).describe("Max trades to return"),
      }),
      execute: async function ({ limit }: { limit?: number }) {
        "use step"; // Durable - retries on failure
        const params = new URLSearchParams();
        params.set("wallet", walletAddress);
        params.set("limit", String(limit || 20));
        const res = await fetch(`${BASE_URL}/api/dflow/trades?${params}`);
        if (!res.ok) {
          return { success: false, error: `Failed: ${res.status}` };
        }
        const data = await res.json();
        return { success: true, trades: data.trades || [], count: data.trades?.length || 0 };
      },
    },

    placeOrder: {
      description:
        "Place a buy or sell order on a prediction market.",
      inputSchema: z.object({
        market_ticker: z.string().describe("Market to trade"),
        side: z.enum(["yes", "no"]).describe("Which outcome to trade"),
        action: z.enum(["buy", "sell"]).describe("Buy or sell"),
        quantity: z.number().positive().describe("Number of outcome tokens"),
        limit_price: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Limit price (0-1)"),
      }),
      execute: async function (args: {
        market_ticker: string;
        side: "yes" | "no";
        action: "buy" | "sell";
        quantity: number;
        limit_price?: number;
      }) {
        "use step"; // Durable - retries on failure
        const res = await fetch(`${BASE_URL}/api/dflow/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: walletAddress,
            wallet_private_key: privateKey,
            market_ticker: args.market_ticker,
            side: args.side,
            action: args.action,
            quantity: args.quantity,
            limit_price: args.limit_price,
            execution_mode: "sync",
          }),
        });
        if (!res.ok) {
          const errorText = await res.text();
          return { success: false, error: `Failed: ${res.status} - ${errorText}` };
        }
        return { success: true, order: await res.json() };
      },
    },

    getOrderStatus: {
      description: "Check the status of an order.",
      inputSchema: z.object({
        order_id: z.string().describe("Order ID to check"),
      }),
      execute: async function ({ order_id }: { order_id: string }) {
        "use step"; // Durable - retries on failure
        const res = await fetch(`${BASE_URL}/api/dflow/order/${order_id}`);
        if (!res.ok) {
          return { success: false, error: `Failed: ${res.status}` };
        }
        return { success: true, order: await res.json() };
      },
    },

    cancelOrder: {
      description: "Cancel a pending order.",
      inputSchema: z.object({
        order_id: z.string().describe("Order ID to cancel"),
      }),
      execute: async function ({ order_id }: { order_id: string }) {
        // NO "use step" - don't retry cancellations
        const res = await fetch(`${BASE_URL}/api/dflow/order/${order_id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: walletAddress,
            wallet_private_key: privateKey,
          }),
        });
        if (!res.ok) {
          return { success: false, error: `Failed: ${res.status}` };
        }
        return { success: true, result: await res.json() };
      },
    },
  };
}

// ============================================================================
// Trading Agent Workflow
// ============================================================================

/**
 * DurableAgent-based trading workflow.
 * Streams UIMessageChunk for AI-SDK compatibility with useChat.
 */
export async function tradingAgentWorkflow(
  input: TradingInput
): Promise<TradingResult> {
  // Get writable stream for real-time UI updates (AI-SDK format)
  const writable = getWritable<UIMessageChunk>();

  console.log(`[tradingAgent:${input.modelId}] Starting trading workflow`);

  try {
    // Step 1: Get session
    const session = await getSession();

    // Step 2: Get or create agent session
    const agentSession = await getAgentSessionStep(
      session.id,
      input.modelId,
      input.walletAddress
    );

    // Step 3: Fetch market context
    const context = await fetchContext(input.walletAddress);

    // Step 4: Build context prompt
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
      signal: input.signal,
    };
    const contextPrompt = buildContextPrompt(promptInput);

    // Step 5: Create durable tools with wallet context
    const privateKey = getWalletPrivateKey(input.modelId);
    const tools = createDurableTools(input.walletAddress, privateKey);

    // Step 6: Create DurableAgent
    // Note: Use 'as any' to handle AI SDK v6 model compatibility
    const agent = new DurableAgent({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: () => Promise.resolve(getModel(input.modelId) as any),
      system: TRADING_SYSTEM_PROMPT,
      tools,
      maxOutputTokens: 4096,
    });

    // Step 7: Run agent with streaming
    const result = await agent.stream({
      messages: [{ role: "user", content: contextPrompt }],
      writable,
      maxSteps: TRADING_CONFIG.maxStepsPerAgent,
      onStepFinish: (step) => {
        console.log(`[tradingAgent:${input.modelId}] Step finished:`, {
          hasText: !!step.text,
          toolCallCount: step.toolCalls?.length ?? 0,
        });
      },
    });

    // Step 8: Extract trades from results
    const trades = extractTrades(result.steps);

    // Step 9: Determine decision type
    let decision: DecisionType = "hold";
    const lastStep = result.steps[result.steps.length - 1];
    const reasoning = lastStep?.text || "No reasoning provided.";

    if (trades.length > 0) {
      decision = trades[0].action === "buy" ? "buy" : "sell";
    } else if (reasoning.toLowerCase().includes("skip")) {
      decision = "skip";
    }

    // Step 10: Get market info
    const marketTicker =
      input.signal?.ticker || trades[0]?.marketTicker || input.priceSwings[0]?.ticker;
    const marketTitle = trades[0]?.marketTitle;
    const portfolioValue = context.portfolio.totalValue;

    const tradingResult: TradingResult = {
      reasoning,
      trades,
      steps: result.steps.length,
      decision,
      marketTicker,
      marketTitle,
      portfolioValue,
    };

    // Step 11: Wait for fills
    if (trades.length > 0) {
      await waitForFills(trades);
    }

    // Step 12: Record to database (triggers Supabase Realtime → chat feed)
    await recordDecisionAndTrades(agentSession, input, tradingResult);

    return tradingResult;
  } catch (error) {
    console.error(`[tradingAgent:${input.modelId}] Error:`, error);
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

async function getAgentSessionStep(
  sessionId: string,
  modelId: string,
  walletAddress: string
): Promise<AgentSession> {
  "use step";
  const modelName = getModelName(modelId) || modelId;
  return await getOrCreateAgentSession(sessionId, modelId, modelName, walletAddress);
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
      `${BASE_URL}/api/solana/balance?wallet=${walletAddress}`
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
        console.error(`[tradingAgent] Error checking order status:`, error);
      }

      // Durable sleep with exponential backoff (5s, 10s, 20s, ...)
      const delay = Math.min(5 * Math.pow(2, attempt), 60);
      await sleep(`${delay}s`);
    }
  }
}

async function recordDecisionAndTrades(
  agentSession: AgentSession,
  input: TradingInput,
  result: TradingResult
): Promise<void> {
  "use step";

  // Determine trigger type from signal
  let triggerType: TriggerType = "periodic";
  if (input.signal) {
    triggerType = input.signal.type;
  } else if (input.priceSwings.length > 0) {
    triggerType = "price_swing";
  }

  // Record the decision
  const decision = await recordAgentDecision({
    agentSessionId: agentSession.id,
    triggerType,
    triggerDetails: input.signal?.data || {
      priceSwings: input.priceSwings,
    },
    marketTicker: result.marketTicker,
    marketTitle: result.marketTitle,
    decision: result.decision,
    reasoning: result.reasoning,
    confidence: result.confidence,
    portfolioValueAfter: result.portfolioValue,
  });

  console.log(
    `[tradingAgent:${input.modelId}] Recorded decision: ${result.decision} (id: ${decision.id})`
  );

  // Record each trade
  for (const trade of result.trades) {
    await recordAgentTrade({
      decisionId: decision.id,
      agentSessionId: agentSession.id,
      marketTicker: trade.marketTicker,
      marketTitle: trade.marketTitle,
      side: trade.side,
      action: trade.action,
      quantity: trade.quantity,
      price: trade.price,
      notional: trade.notional,
      txSignature: trade.id,
      pnl: trade.pnl,
    });
  }

  // Update agent session's current value
  await updateAgentSessionValue(
    agentSession.id,
    result.portfolioValue,
    result.portfolioValue - agentSession.startingCapital
  );
}
