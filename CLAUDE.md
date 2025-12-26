# Alpha Arena

AI prediction market trading competition on dflow. LLMs autonomously trade on prediction markets 24/7.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
│     / (charts)  |  /chat  |  /positions  |  /trades            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  /api/sessions  │ │  /api/dflow/*   │ │  /api/chat      │
│  /api/performance│ │  (On-chain)     │ │  (Streaming)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                     │                   │
        ▼                     ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Supabase     │ │   dflow APIs    │ │   AI Agents     │
│                 │ │  Swap/Metadata  │ │                 │
│ - sessions      │ └─────────────────┘ │ - chatAgent     │
│ - snapshots     │                     │ - Trading       │
│ - chat_messages │                     │   Workflow      │
│ - market_prices │                     └─────────────────┘
└─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Autonomous Trading Loop                      │
│                        (useWorkflow)                            │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │           priceWatcherWorkflow (long-lived)             │  │
│   │                                                         │  │
│   │   while (true) {                                        │  │
│   │     prices = await fetchPrices()     // "use step"      │  │
│   │     swings = detectSwings(prices)                       │  │
│   │     if (swings.length > 0) {                            │  │
│   │       await runAgents(swings)        // "use step"      │  │
│   │     }                                                   │  │
│   │     await sleep("10s")               // durable sleep   │  │
│   │   }                                                     │  │
│   └─────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  For each LLM model (parallel):                         │  │
│   │  1. Fetch context (positions, balance)                  │  │
│   │  2. Run guardrails pre-check                            │  │
│   │  3. Run agentic loop with streaming                     │  │
│   │  4. Agent uses tools (research, trade)                  │  │
│   │  5. Broadcast decision to chat                          │  │
│   └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## AI Module Architecture

```
lib/ai/
├── models/           # Model definitions & registry
│   ├── catalog.ts    # Model catalog with wallet addresses
│   ├── registry.ts   # AI SDK provider registry
│   ├── providers.ts  # Provider configurations
│   ├── openrouter.ts # OpenRouter provider
│   └── aimo.ts       # AIMO provider
│
├── tools/            # Agent tools (wallet-injected)
│   ├── index.ts      # createAgentTools() factory
│   ├── market-discovery/
│   │   ├── getMarkets.ts
│   │   ├── getMarketDetails.ts
│   │   └── getLiveData.ts
│   ├── portfolio-management/
│   │   ├── getBalance.ts
│   │   ├── getPositions.ts
│   │   └── getTradeHistory.ts
│   └── trade-execution/
│       ├── placeOrder.ts
│       ├── getOrderStatus.ts
│       └── cancelOrder.ts
│
├── agents/           # Agent implementations
│   ├── predictionMarketAgent.ts  # Core agent logic (used by workflow)
│   └── chatAgent.ts              # Chat assistant
│
├── prompts/          # System prompts (top-level)
│   ├── index.ts
│   ├── trading/
│   │   ├── systemPrompt.ts       # Trading agent identity
│   │   └── contextBuilder.ts     # Market context → prompt
│   └── chat/
│       └── assistantPrompt.ts    # Chat assistant prompt
│
├── guardrails/       # Risk control & validation
│   ├── index.ts
│   ├── types.ts                  # RiskLimits interface
│   └── riskLimits.ts             # Pre-trade validation
│
└── middleware/       # AI SDK middleware
    └── tradingGuardrails.ts      # LLM-level limits (maxTokens, etc.)

lib/workflows/        # useWorkflow durable workflows
├── index.ts
├── priceWatcher.ts   # Long-lived price polling workflow
├── tradingAgent.ts   # Per-model trading execution
└── dailyReview.ts    # Daily P&L analysis
```

---

## Implementation Plan

### Phase 1: Structural Reorganization

**Goal**: Elevate prompts to top-level, add guardrails layer with AI SDK middleware.

#### 1.1 Create `/prompts` Directory

Move prompts from `agents/prompts/` to top-level `prompts/`:

```
lib/ai/prompts/
├── index.ts                    # Export all prompts
├── trading/
│   ├── systemPrompt.ts         # TRADING_SYSTEM_PROMPT
│   └── contextBuilder.ts       # buildContextPrompt()
└── chat/
    └── assistantPrompt.ts      # ARENA_ASSISTANT_PROMPT
```

**File: `lib/ai/prompts/trading/systemPrompt.ts`**

```typescript
export const TRADING_SYSTEM_PROMPT = `You are an autonomous prediction market trader competing in Alpha Arena.

## Your Tools

**Research:**
- getMarkets: List available prediction markets
- getMarketDetails: Get details for a specific market
- getLiveData: Get current prices and orderbook depth

**Portfolio:**
- getBalance: Check your wallet balance (USDC)
- getPositions: See your current open positions
- getTradeHistory: Review your past trades

**Trading:**
- placeOrder: Execute a buy or sell order
- getOrderStatus: Check if an order filled
- cancelOrder: Cancel a pending order

## Trading Guidelines

1. **Research First**: Always check market details and your portfolio before trading
2. **High Conviction Only**: Only trade when confidence > 70%
3. **Risk Management**: 
   - Never risk more than 20% of portfolio on a single position
   - Consider your existing positions before adding more
4. **Explain Reasoning**: Document your analysis and decision process

## Workflow

1. Review the market data provided
2. Use tools to gather additional information if needed
3. Analyze opportunities based on your predictions
4. If high-conviction opportunity exists, execute trade
5. Summarize your reasoning and actions

Remember: You are competing against other AI models. Make smart, calculated decisions.`;
```

**File: `lib/ai/prompts/trading/contextBuilder.ts`**

```typescript
import type { MarketContext, PriceSwing } from "@/types";

export function buildContextPrompt(
  context: MarketContext,
  priceSwings?: PriceSwing[]
): string {
  let prompt = `## Current Market Data\n\n`;

  if (priceSwings && priceSwings.length > 0) {
    prompt += `### Price Swings Detected\n\n`;
    prompt += `The following markets have significant price movements:\n`;
    prompt += JSON.stringify(priceSwings, null, 2);
    prompt += `\n\n`;
  }

  prompt += `### Available Markets\n\n`;
  prompt += JSON.stringify(context.availableMarkets, null, 2);

  prompt += `\n\n## Your Portfolio\n\n`;
  prompt += `Cash balance: $${context.portfolio.cashBalance.toFixed(2)}\n`;
  prompt += `Total value: $${context.portfolio.totalValue.toFixed(2)}\n\n`;

  prompt += `### Current Positions\n\n`;
  if (context.portfolio.positions.length > 0) {
    prompt += JSON.stringify(context.portfolio.positions, null, 2);
  } else {
    prompt += `No open positions`;
  }

  prompt += `\n\n## Recent Activity\n\n`;
  if (context.recentTrades.length > 0) {
    prompt += JSON.stringify(context.recentTrades.slice(0, 5), null, 2);
  } else {
    prompt += `No recent trades`;
  }

  prompt += `\n\n## Instructions\n\n`;
  prompt += `Analyze the markets above. Use your tools to gather more information if needed.\n`;
  prompt += `If you identify a trading opportunity with high conviction, execute a trade.\n`;
  prompt += `Explain your reasoning throughout the process.`;

  return prompt;
}
```

#### 1.2 Create `/guardrails` Directory

Guardrails are split into two layers:
1. **AI SDK Middleware** - LLM-level limits (maxTokens, maxToolCalls)
2. **Trade Validation** - Business logic for risk management

```
lib/ai/guardrails/
├── index.ts           # Export all guardrails
├── types.ts           # RiskLimits interface
└── riskLimits.ts      # Pre-trade validation
```

**File: `lib/ai/guardrails/types.ts`**

```typescript
export interface RiskLimits {
  /** Max percentage of portfolio for single position (e.g., 0.20 = 20%) */
  maxSinglePosition: number;
  
  /** Max total exposure as percentage of portfolio (e.g., 0.80 = 80%) */
  maxTotalExposure: number;
  
  /** Max daily loss before halting (e.g., 0.05 = 5%) */
  maxDailyLoss: number;
  
  /** Max trade size in dollars */
  maxTradeSize: number;
  
  /** Minimum confidence required to trade (e.g., 0.70 = 70%) */
  minConfidence: number;
}

export interface TradeValidationResult {
  approved: boolean;
  reason?: string;
  adjustedSize?: number;
}

export interface PortfolioState {
  availableBalance: number;
  totalValue: number;
  positions: {
    marketId: string;
    value: number;
  }[];
  todayPnL: number;
}
```

**File: `lib/ai/guardrails/riskLimits.ts`**

```typescript
import { TRADING_CONFIG } from "@/lib/config";
import type { RiskLimits, TradeValidationResult, PortfolioState } from "./types";

const DEFAULT_LIMITS: RiskLimits = {
  maxSinglePosition: TRADING_CONFIG.maxPositionPercent,
  maxTotalExposure: 0.80,
  maxDailyLoss: 0.05,
  maxTradeSize: 100, // $100 max per trade
  minConfidence: TRADING_CONFIG.minConfidence,
};

export function validateTrade(
  tradeSize: number,
  marketId: string,
  portfolio: PortfolioState,
  limits: RiskLimits = DEFAULT_LIMITS
): TradeValidationResult {
  
  // Check absolute trade size limit
  if (tradeSize > limits.maxTradeSize) {
    return {
      approved: false,
      reason: `Exceeds max trade size ($${limits.maxTradeSize})`,
      adjustedSize: limits.maxTradeSize,
    };
  }

  // Check single position limit
  const positionRatio = tradeSize / portfolio.totalValue;
  if (positionRatio > limits.maxSinglePosition) {
    const adjustedSize = portfolio.totalValue * limits.maxSinglePosition;
    return {
      approved: false,
      reason: `Exceeds single position limit (${(limits.maxSinglePosition * 100).toFixed(0)}%)`,
      adjustedSize: Math.min(adjustedSize, limits.maxTradeSize),
    };
  }

  // Check total exposure
  const currentExposure = portfolio.positions.reduce((sum, p) => sum + p.value, 0);
  const newExposure = currentExposure + tradeSize;
  if (newExposure / portfolio.totalValue > limits.maxTotalExposure) {
    return {
      approved: false,
      reason: `Exceeds total exposure limit (${(limits.maxTotalExposure * 100).toFixed(0)}%)`,
    };
  }

  // Check daily loss limit
  if (portfolio.todayPnL / portfolio.totalValue < -limits.maxDailyLoss) {
    return {
      approved: false,
      reason: `Daily loss limit reached (${(limits.maxDailyLoss * 100).toFixed(0)}%)`,
    };
  }

  return { approved: true };
}
```

**File: `lib/ai/guardrails/index.ts`**

```typescript
export * from "./types";
export { validateTrade } from "./riskLimits";
```

#### 1.3 LLM-Level Guardrails Middleware

The middleware for LLM-level limits is now part of the guardrails module.

**File: `lib/ai/guardrails/middleware.ts`**

```typescript
import type { LanguageModelMiddleware } from "ai";
import type { TradingMiddlewareConfig } from "./types";

/**
 * Creates middleware that enforces LLM-level limits.
 * Observability is handled by useWorkflow dashboard, not this middleware.
 */
export function createTradingMiddleware(
  config: Partial<TradingMiddlewareConfig> = {}
): LanguageModelMiddleware {
  // ... implementation
}

// Default configuration
export const DEFAULT_TRADING_MIDDLEWARE_CONFIG: TradingMiddlewareConfig = {
  maxTokens: 4096,
  maxToolCalls: 20,
  maxTradesPerRun: 3,
  modelId: "unknown",
};
```

#### 1.4 Update Agent Imports

Update `lib/ai/agents/predictionMarketAgent.ts` to import from new locations:

```typescript
// Before
import { TRADING_SYSTEM_PROMPT, buildContextPrompt } from "./prompts/tradingPrompt";

// After
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/trading/systemPrompt";
import { buildContextPrompt } from "@/lib/ai/prompts/trading/contextBuilder";
import { validateTrade, createTradingMiddleware } from "@/lib/ai/guardrails";
```

---

### Phase 2: Workflow-Based Data Pipeline

**Goal**: Replace cron-triggered agent runs with a durable polling workflow using useWorkflow.

#### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Workflow-Based Price Watching                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │              priceWatcherWorkflow (long-lived)                │ │
│  │                                                               │ │
│  │   Price Cache (in-memory, persisted across suspensions)       │ │
│  │   ┌─────────────────────────────────────────────────────────┐ │ │
│  │   │  Map<ticker, { lastMid, lastUpdate }>                   │ │ │
│  │   └─────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │   while (true) {                                              │ │
│  │     // Step 1: Fetch prices from dflow REST API              │ │
│  │     const prices = await fetchPrices();  // "use step"       │ │
│  │                                                               │ │
│  │     // Step 2: Detect swings (in-memory comparison)          │ │
│  │     const swings = detectSwings(prices, priceCache);         │ │
│  │                                                               │ │
│  │     // Step 3: If swings detected, run agents                │ │
│  │     if (swings.length > 0) {                                 │ │
│  │       await runAgentsForSwings(swings);  // "use step"       │ │
│  │     }                                                         │ │
│  │                                                               │ │
│  │     // Step 4: Update cache                                   │ │
│  │     updatePriceCache(prices, priceCache);                    │ │
│  │                                                               │ │
│  │     // Step 5: Save to DB for history (async)                │ │
│  │     await savePriceHistory(prices);  // "use step"           │ │
│  │                                                               │ │
│  │     // Durable sleep - workflow suspends, costs nothing      │ │
│  │     await sleep("10s");                                       │ │
│  │   }                                                           │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Benefits:                                                          │
│  ✓ Single observable workflow (not thousands of cron runs)         │
│  ✓ Stateful swing detection (price cache persisted)                │
│  ✓ Durable sleep (survives deploys, crashes)                       │
│  ✓ All steps visible in workflow dashboard                         │
│  ✓ Automatic retries on failures                                   │
│                                                                     │
│  Future Enhancement:                                                │
│  When ready for real-time, add webhook for dflow WebSocket:        │
│  - wss://prediction-markets-api.dflow.net/api/v1/ws                │
│  - Subscribe to "prices" and "trades" channels                     │
│  - Forward to workflow webhook URL                                  │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.2 Directory Structure

```
lib/workflows/
├── index.ts               # Export all workflows
├── priceWatcher.ts        # Long-lived price polling workflow
├── tradingAgent.ts        # Agent execution with streaming
└── dailyReview.ts         # Daily P&L analysis
```

#### 2.3 Price Watcher Workflow

**File: `lib/workflows/priceWatcher.ts`**

```typescript
"use workflow";

import { sleep } from "workflow";
import { start } from "workflow/api";
import { tradingAgentWorkflow } from "./tradingAgent";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";

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

const SWING_THRESHOLD = 0.05; // 5% price change triggers agents
const POLL_INTERVAL = "10s"; // Poll every 10 seconds
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

  const response = await fetch(`${BASE_URL}/api/dflow/markets`);
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
}
```

#### 2.4 Trading Agent Workflow

**File: `lib/workflows/tradingAgent.ts`**

```typescript
"use workflow";

import { getWritable, sleep } from "workflow";
import { generateText, wrapLanguageModel, stepCountIs } from "ai";
import { getModel } from "@/lib/ai/models";
import { getWalletPrivateKey } from "@/lib/ai/models/catalog";
import { createAgentTools } from "@/lib/ai/tools";
import { createTradingMiddleware } from "@/lib/ai/guardrails";
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/trading/systemPrompt";
import { buildContextPrompt } from "@/lib/ai/prompts/trading/contextBuilder";
import { getGlobalSession } from "@/lib/supabase/db";
import { saveChatMessage } from "@/lib/supabase/db";
import { nanoid } from "nanoid";

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

// ============================================================================
// Trading Agent Workflow
// ============================================================================

/**
 * Executes a trading agent with streaming output.
 * Each agent run is a separate workflow instance.
 */
export async function tradingAgentWorkflow(input: TradingInput) {
  // Get writable stream for real-time updates to frontend
  const stream = getWritable<StreamChunk>();

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

async function fetchContext(walletAddress: string) {
  "use step";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  // Fetch balance
  const balanceRes = await fetch(
    `${baseUrl}/api/solana/balance?wallet=${walletAddress}`
  );
  const balanceData = await balanceRes.json();
  const cashBalance = parseFloat(balanceData.formatted) || 0;

  // Fetch markets
  const marketsRes = await fetch(`${baseUrl}/api/dflow/markets`);
  const markets = await marketsRes.json();

  // Fetch positions (simplified - full implementation in existing code)
  const positions: Array<{
    marketTicker: string;
    marketTitle: string;
    side: "yes" | "no";
    quantity: number;
  }> = [];

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
  context: ReturnType<typeof fetchContext> extends Promise<infer T> ? T : never,
  sessionId: string,
  stream: ReturnType<typeof getWritable<StreamChunk>>
) {
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
  const tools = createAgentTools(
    input.walletAddress,
    getWalletPrivateKey(input.modelId)
  );

  // Build context prompt
  const contextPrompt = buildContextPrompt(
    {
      availableMarkets: context.availableMarkets.map((m: any) => ({
        ticker: m.ticker,
        title: m.title,
        yesPrice: parseFloat(m.yes_price) || 0.5,
        noPrice: parseFloat(m.no_price) || 0.5,
        volume: parseFloat(m.volume) || 0,
        status: m.status || "open",
      })),
      portfolio: context.portfolio,
      recentTrades: context.recentTrades,
    },
    input.priceSwings
  );

  // Execute agentic loop
  const result = await generateText({
    model,
    system: TRADING_SYSTEM_PROMPT,
    prompt: contextPrompt,
    tools,
    stopWhen: stepCountIs(5),
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
            const args = (call as any).input || {};
            stream.write({
              type: "trade",
              trade: {
                ticker: args.market_ticker,
                side: args.side,
                quantity: args.quantity,
                price: args.limit_price || 0,
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

function extractTrades(steps: any[]): Array<{
  id: string;
  ticker: string;
  side: string;
  quantity: number;
  price: number;
}> {
  const trades: Array<{
    id: string;
    ticker: string;
    side: string;
    quantity: number;
    price: number;
  }> = [];

  for (const step of steps) {
    if (!step.toolCalls || !step.toolResults) continue;

    for (const call of step.toolCalls) {
      if (call.toolName === "placeOrder") {
        const result = step.toolResults.find(
          (r: any) => r.toolCallId === call.toolCallId
        );
        if (result?.output?.success) {
          const args = call.input || {};
          trades.push({
            id: result.output.order?.id || nanoid(),
            ticker: args.market_ticker,
            side: args.side,
            quantity: args.quantity,
            price: result.output.order?.price || args.limit_price || 0,
          });
        }
      }
    }
  }

  return trades;
}

async function waitForFills(
  trades: Array<{ id: string; ticker: string }>
): Promise<void> {
  "use step";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  for (const trade of trades) {
    // Poll for fill status with exponential backoff
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await fetch(`${baseUrl}/api/dflow/order/${trade.id}`);
      const status = await res.json();

      if (status.status === "filled" || status.status === "cancelled") {
        break;
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
  result: { reasoning: string; trades: any[]; steps: number }
): Promise<void> {
  "use step";

  const message = {
    id: nanoid(),
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: result.reasoning }],
    metadata: {
      sessionId,
      authorType: "model" as const,
      authorId: modelId,
      messageType: result.trades.length > 0 ? "trade" : "commentary",
      relatedTradeId: result.trades[0]?.id,
      createdAt: Date.now(),
    },
  };

  await saveChatMessage(message);
}
```

#### 2.5 Daily Review Workflow

**File: `lib/workflows/dailyReview.ts`**

```typescript
"use workflow";

import { generateText } from "ai";
import { getModel } from "@/lib/ai/models";

interface DailyReviewInput {
  sessionId: string;
  date: string; // YYYY-MM-DD
}

interface DailyReviewResult {
  totalPnL: number;
  tradesAnalyzed: number;
  lessonsLearned: string[];
  calibrationScore: number;
}

/**
 * Analyzes daily trading performance and extracts insights.
 * Triggered by cron at end of each trading day.
 */
export async function dailyReviewWorkflow(
  input: DailyReviewInput
): Promise<DailyReviewResult> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  // Step 1: Fetch today's trades
  const trades = await fetchTrades(baseUrl, input.date);

  // Step 2: Fetch settlements
  const settlements = await fetchSettlements(baseUrl, input.date);

  // Step 3: Calculate P&L
  const pnl = calculatePnL(trades);

  // Step 4: Analyze with LLM
  const analysis = await analyzeTrades(trades, settlements, pnl);

  // Step 5: Save review
  await saveReview(baseUrl, input, pnl, trades.length, analysis);

  return {
    totalPnL: pnl,
    tradesAnalyzed: trades.length,
    lessonsLearned: analysis.lessons,
    calibrationScore: analysis.calibrationScore,
  };
}

async function fetchTrades(baseUrl: string, date: string) {
  "use step";
  const response = await fetch(`${baseUrl}/api/trades?date=${date}`);
  const data = await response.json();
  return data.data || [];
}

async function fetchSettlements(baseUrl: string, date: string) {
  "use step";
  const response = await fetch(`${baseUrl}/api/settlements?date=${date}`);
  const data = await response.json();
  return data.data || [];
}

function calculatePnL(trades: Array<{ realized_pnl?: number }>): number {
  return trades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
}

async function analyzeTrades(
  trades: any[],
  settlements: any[],
  pnl: number
): Promise<{ lessons: string[]; calibrationScore: number }> {
  "use step";

  const model = getModel("openrouter/gpt-4o-mini");

  const { text } = await generateText({
    model,
    system: `You are analyzing trading performance for a prediction market agent.
Extract key lessons and calibration insights.
Return JSON: { lessons: string[], calibrationScore: number }`,
    prompt: `Trades: ${JSON.stringify(trades)}
Settlements: ${JSON.stringify(settlements)}
Total P&L: $${pnl.toFixed(2)}`,
  });

  try {
    return JSON.parse(text);
  } catch {
    return { lessons: [], calibrationScore: 0.5 };
  }
}

async function saveReview(
  baseUrl: string,
  input: DailyReviewInput,
  pnl: number,
  tradesCount: number,
  analysis: { lessons: string[]; calibrationScore: number }
): Promise<void> {
  "use step";

  await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: input.sessionId,
      date: input.date,
      pnl,
      tradesCount,
      lessons: analysis.lessons,
      calibrationScore: analysis.calibrationScore,
    }),
  });
}
```

#### 2.6 Workflow Index

**File: `lib/workflows/index.ts`**

```typescript
export { priceWatcherWorkflow } from "./priceWatcher";
export { tradingAgentWorkflow } from "./tradingAgent";
export { dailyReviewWorkflow } from "./dailyReview";
```

#### 2.7 Starting the Price Watcher

**File: `app/api/workflows/start/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { start, getRun } from "workflow/api";
import { priceWatcherWorkflow } from "@/lib/workflows";

// Singleton run ID for the price watcher
const PRICE_WATCHER_RUN_ID = "price-watcher-singleton";

export async function POST(req: Request) {
  // Verify admin secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if already running
    const existingRun = await getRun(PRICE_WATCHER_RUN_ID);
    if (existingRun && existingRun.status === "running") {
      return NextResponse.json({
        message: "Price watcher already running",
        runId: PRICE_WATCHER_RUN_ID,
      });
    }

    // Start the workflow
    const run = await start(priceWatcherWorkflow, [], {
      runId: PRICE_WATCHER_RUN_ID,
    });

    return NextResponse.json({
      success: true,
      runId: run.runId,
      status: await run.status,
    });
  } catch (error) {
    console.error("Failed to start price watcher:", error);
    return NextResponse.json(
      { error: "Failed to start workflow" },
      { status: 500 }
    );
  }
}
```

#### 2.8 Update Cron Job (Fallback + Snapshots)

The cron job becomes a fallback and handles snapshots:

**File: `app/api/cron/trading/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRun, start } from "workflow/api";
import { priceWatcherWorkflow } from "@/lib/workflows";

const PRICE_WATCHER_RUN_ID = "price-watcher-singleton";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Check if price watcher workflow is running
    const run = await getRun(PRICE_WATCHER_RUN_ID);

    if (!run || run.status !== "running") {
      console.log("[cron] Price watcher not running, restarting...");

      // Restart the workflow
      await start(priceWatcherWorkflow, [], {
        runId: PRICE_WATCHER_RUN_ID,
      });

      return NextResponse.json({
        message: "Price watcher restarted",
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      message: "Price watcher healthy",
      status: run.status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] Health check failed:", error);
    return NextResponse.json(
      { error: "Health check failed" },
      { status: 500 }
    );
  }
}
```

---

### Phase 3: Frontend Streaming Integration

**Goal**: Display real-time agent reasoning in the chat interface.

#### 3.1 Resumable Streams for Chat

**File: `app/api/chat/stream/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRun } from "workflow/api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 });
  }

  try {
    const run = await getRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Return the readable stream
    const readable = await run.getReadable();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Stream error:", error);
    return NextResponse.json(
      { error: "Failed to get stream" },
      { status: 500 }
    );
  }
}
```

---

## Environment Variables

```bash
# API Keys
OPENROUTER_API_KEY=sk-or-...
AIMO_API_KEY=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Security
CRON_SECRET=your-cron-secret
ADMIN_SECRET=your-admin-secret

# App URL
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app

# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Model Wallets (Public Keys)
WALLET_GPT4O_PUBLIC=<solana-public-key>
WALLET_GPT4O_MINI_PUBLIC=<solana-public-key>
WALLET_CLAUDE_SONNET_PUBLIC=<solana-public-key>
WALLET_CLAUDE_HAIKU_PUBLIC=<solana-public-key>
WALLET_GEMINI_FLASH_PUBLIC=<solana-public-key>
WALLET_DEEPSEEK_PUBLIC=<solana-public-key>
WALLET_LLAMA_PUBLIC=<solana-public-key>
WALLET_MISTRAL_PUBLIC=<solana-public-key>

# Model Wallets (Private Keys - for signing)
WALLET_GPT4O_PRIVATE=<solana-private-key>
WALLET_GPT4O_MINI_PRIVATE=<solana-private-key>
WALLET_CLAUDE_SONNET_PRIVATE=<solana-private-key>
WALLET_CLAUDE_HAIKU_PRIVATE=<solana-private-key>
WALLET_GEMINI_FLASH_PRIVATE=<solana-private-key>
WALLET_DEEPSEEK_PRIVATE=<solana-private-key>
WALLET_LLAMA_PRIVATE=<solana-private-key>
WALLET_MISTRAL_PRIVATE=<solana-private-key>
```

---

## Implementation Checklist

### Phase 1: Structural Reorganization
- [x] Create `lib/ai/prompts/` directory
- [x] Move `tradingPrompt.ts` to `lib/ai/prompts/trading/systemPrompt.ts`
- [x] Create `lib/ai/prompts/trading/contextBuilder.ts`
- [x] Create `lib/ai/guardrails/` directory
- [x] Create `lib/ai/guardrails/types.ts`
- [x] Create `lib/ai/guardrails/riskLimits.ts`
- [x] Create `lib/ai/guardrails/middleware.ts` (LLM-level limits)
- [x] Update agent imports

### Phase 2: Workflow-Based Data Pipeline
- [ ] Install useWorkflow: `npm install workflow`
- [ ] Create `lib/workflows/` directory
- [ ] Implement `priceWatcherWorkflow`
- [ ] Implement `tradingAgentWorkflow` with streaming
- [ ] Implement `dailyReviewWorkflow`
- [ ] Create `/api/workflows/start` endpoint
- [ ] Update cron job to be health-check only
- [ ] Test workflow execution via `npx workflow web`

### Phase 3: Frontend Streaming
- [ ] Create `/api/chat/stream` endpoint for resumable streams
- [ ] Update chat UI to consume workflow streams
- [ ] Add reconnection logic for interrupted streams

---

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `lib/ai/prompts/index.ts` | Export all prompts |
| `lib/ai/prompts/trading/systemPrompt.ts` | Trading agent system prompt |
| `lib/ai/prompts/trading/contextBuilder.ts` | Build context prompt |
| `lib/ai/prompts/chat/assistantPrompt.ts` | Chat assistant prompt |
| `lib/ai/guardrails/index.ts` | Export guardrails |
| `lib/ai/guardrails/types.ts` | Risk limit types |
| `lib/ai/guardrails/riskLimits.ts` | Trade validation |
| `lib/ai/guardrails/middleware.ts` | LLM-level limits middleware |
| `lib/workflows/index.ts` | Export workflows |
| `lib/workflows/priceWatcher.ts` | Long-lived price polling workflow |
| `lib/workflows/tradingAgent.ts` | Agent execution with streaming |
| `lib/workflows/dailyReview.ts` | Daily P&L analysis |
| `app/api/workflows/start/route.ts` | Start workflow endpoint |
| `app/api/chat/stream/route.ts` | Resumable stream endpoint |

### Files to Modify
| File | Changes |
|------|---------|
| `lib/ai/agents/predictionMarketAgent.ts` | Update imports for prompts/guardrails |
| `app/api/cron/trading/route.ts` | Become health-check for workflow |

### Files to Delete
| File | Reason |
|------|--------|
| `lib/ai/agents/prompts/tradingPrompt.ts` | Moved to `lib/ai/prompts/` |

---

## Database Changes

| Table | Purpose |
|-------|---------|
| `market_prices` | Current price snapshot per market |
| `market_price_history` | Historical prices for charts/analytics |

---

## Future Enhancements

### Real-Time WebSocket Integration

When ready for sub-second latency, add a WebSocket forwarder:

1. **Deploy worker to Railway** ($5/mo) that maintains WebSocket connection
2. **Create workflow webhook** in `priceWatcherWorkflow`:
   ```typescript
   const webhook = createWebhook();
   console.log("Forward prices to:", webhook.url);
   for await (const request of webhook) {
     const update = await request.json();
     // Process real-time updates
   }
   ```
3. **Update Railway worker** to POST to webhook URL instead of polling

### dflow WebSocket Endpoints

- Prices: `wss://prediction-markets-api.dflow.net/api/v1/ws`
  - Subscribe: `{ "type": "subscribe", "channel": "prices", "all": true }`
- Trades: Same endpoint, `channel: "trades"`
- Orderbook: Same endpoint, `channel: "orderbook"`
