# Alpha Arena

AI prediction market trading competition on dflow. LLMs autonomously trade on prediction markets 24/7.

## Architecture

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
│ - snapshots     │                     │ - PredictionMkt │
│ - chat_messages │                     │   Agent (class) │
│ - market_prices │                     └─────────────────┘
└─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Autonomous Trading Loop                      │
│                                                                  │
│   Vercel Cron (1 min) ──► Fetch Prices ──► Detect Swings       │
│                                │                                │
│                                ▼                                │
│              ┌─────────────────────────────────┐               │
│              │  For each LLM model:            │               │
│              │  1. Instantiate agent class     │               │
│              │  2. Run agentic loop            │               │
│              │  3. Agent uses tools (research) │               │
│              │  4. Agent decides & trades      │               │
│              │  5. Broadcast decision          │               │
│              └─────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Refactoring Plan: Autonomous LLM Trading

### Overview

**Current state**: `PredictionMarketAgent` class uses a structured pipeline with separate methods (`analyzeMarkets` → `makeDecision` → `generateBroadcast`) but:
- Does NOT actually execute trades (no `placeOrder` call)
- Does NOT use tools in `generateText` (tools defined but not passed)
- Each method makes separate LLM calls instead of unified agentic loop

**Target state**: Keep `PredictionMarketAgent` class architecture but refactor `executeTradingLoop()` to use AI SDK agentic pattern with:
- `maxSteps` for autonomous multi-step reasoning
- `stopWhen` conditions for loop control
- `prepareStep` for phased tool access (research first, then trade)
- Tools passed to `generateText` for autonomous tool calling

---

### Phase 1: Wallet Configuration

**Goal**: Each LLM model has its own wallet for trading.

#### 1.1 Add wallet addresses to model catalog

**File**: `lib/ai/models/catalog.ts`

```typescript
{
  id: "openrouter/gpt-4o",
  name: "GPT-4o",
  // ... existing fields
  walletAddress: process.env.WALLET_GPT4O_PUBLIC,
  enabled: true,
}
```

#### 1.2 Environment variables

```bash
# Public keys (in catalog.ts)
WALLET_GPT4O_PUBLIC=<solana-public-key>
WALLET_CLAUDE_SONNET_PUBLIC=<solana-public-key>
# ... per model

# Private keys (used by placeOrder tool)
WALLET_GPT4O_PRIVATE=<solana-private-key>
WALLET_CLAUDE_SONNET_PRIVATE=<solana-private-key>
# ... per model
```

---

### Phase 2: Refactor PredictionMarketAgent Class

**Goal**: Keep class structure, replace internals with agentic loop.

#### 2.1 Updated class architecture

**File**: `lib/ai/agents/predictionMarketAgent.ts`

```typescript
import { generateText } from "ai";
import { getModel } from "@/lib/ai/models";
import { createAgentTools } from "@/lib/ai/tools";
import { TRADING_SYSTEM_PROMPT } from "./prompts/tradingPrompt";

/**
 * Prediction market trading agent using AI SDK agentic loop.
 * Instantiated per model, encapsulates wallet and session context.
 */
export class PredictionMarketAgent {
  protected config: PredictionMarketAgentConfig;
  protected tools: ReturnType<typeof createAgentTools>;

  constructor(config: PredictionMarketAgentConfig) {
    this.config = config;
    // Create tools with wallet context injected (closure pattern)
    this.tools = createAgentTools(config.walletAddress, config.walletPrivateKey);
  }

  /**
   * Main agentic loop - LLM autonomously decides what to do.
   * Uses AI SDK generateText with tools and maxSteps.
   */
  async executeTradingLoop(context: MarketContext): Promise<AgentExecutionResult> {
    const model = getModel(this.config.modelIdentifier);

    const { text, steps } = await generateText({
      model,
      system: this.getSystemPrompt(),
      prompt: this.buildContextPrompt(context),
      tools: this.tools,
      maxSteps: 5,
      // Stop after trade executed OR max steps reached
      // (using custom stop condition or checking steps)
    });

    // Extract trades from tool call results
    const trades = this.extractTradesFromSteps(steps);

    // Save broadcast to chat
    const messageType = trades.length > 0 ? "trade" : "commentary";
    await this.saveMessage(text, messageType, trades[0]?.id);

    return { reasoning: text, trades, steps };
  }

  /**
   * Phased tool access - research first, then allow trading.
   * Can be used with prepareStep callback.
   */
  protected getToolsForPhase(stepNumber: number): Record<string, Tool> {
    const researchTools = {
      getMarkets: this.tools.getMarkets,
      getMarketDetails: this.tools.getMarketDetails,
      getLiveData: this.tools.getLiveData,
      getBalance: this.tools.getBalance,
      getPositions: this.tools.getPositions,
      getTradeHistory: this.tools.getTradeHistory,
    };

    // First 2 steps: research only
    if (stepNumber <= 2) {
      return researchTools;
    }

    // After research: allow trading
    return {
      ...researchTools,
      placeOrder: this.tools.placeOrder,
      getOrderStatus: this.tools.getOrderStatus,
      cancelOrder: this.tools.cancelOrder,
    };
  }

  /**
   * System prompt defining agent behavior and guidelines.
   */
  protected getSystemPrompt(): string {
    return TRADING_SYSTEM_PROMPT;
  }

  /**
   * Build context prompt from market data and portfolio state.
   */
  protected buildContextPrompt(context: MarketContext): string {
    return `
## Current Market Data

Available markets with significant price movements:
${JSON.stringify(context.availableMarkets, null, 2)}

## Your Portfolio

Cash balance: $${context.portfolio.cashBalance.toFixed(2)}
Total value: $${context.portfolio.totalValue.toFixed(2)}

Current positions:
${context.portfolio.positions.length > 0 
  ? JSON.stringify(context.portfolio.positions, null, 2)
  : "No open positions"}

## Recent Activity

Recent trades:
${context.recentTrades.length > 0
  ? JSON.stringify(context.recentTrades.slice(0, 5), null, 2)
  : "No recent trades"}

## Instructions

Analyze the markets above. Use your tools to gather more information if needed.
If you identify a trading opportunity with high conviction, execute a trade.
Explain your reasoning throughout the process.
`;
  }

  /**
   * Extract executed trades from step results.
   */
  protected extractTradesFromSteps(steps: GenerateTextStep[]): Trade[] {
    const trades: Trade[] = [];
    
    for (const step of steps) {
      if (step.toolCalls) {
        for (const call of step.toolCalls) {
          if (call.toolName === "placeOrder" && call.result?.success) {
            trades.push({
              id: call.result.order?.id,
              marketTicker: call.args.market_ticker,
              side: call.args.side,
              action: call.args.action,
              quantity: call.args.quantity,
              price: call.result.order?.price || call.args.limit_price,
              // ... other fields
            });
          }
        }
      }
    }
    
    return trades;
  }

  /**
   * Save message to arena chat.
   */
  protected async saveMessage(
    content: string,
    messageType: ChatMessageType,
    relatedTradeId?: string
  ): Promise<void> {
    // ... existing implementation
  }

  // Getters
  getModelId(): string { return this.config.modelId; }
  getModelIdentifier(): string { return this.config.modelIdentifier; }
}
```

#### 2.2 Remove deprecated methods

Remove from class:
- `analyzeMarkets()` - agent does this autonomously via tools
- `makeDecision()` - agent decides via agentic loop
- `generateBroadcast()` - agent explains reasoning in final text
- `analyzeMarket()` (private) - replaced by tool calls
- `selectMarketsToAnalyze()` (private) - agent decides what to analyze

Remove:
- `DefaultPredictionMarketAgent` subclass (merge into base class)
- Abstract class pattern (not needed if single implementation)

#### 2.3 Create tool factory with wallet injection

**File**: `lib/ai/tools/index.ts`

```typescript
import { createPlaceOrderTool } from "./trade-execution/placeOrder";
import { getMarketsTool, getMarketDetailsTool, getLiveDataTool } from "./market-discovery";
import { getPositionsTool, getBalanceTool, getTradeHistoryTool } from "./portfolio-management";

/**
 * Create tools with wallet context injected.
 * Each agent instance gets tools bound to its wallet.
 */
export function createAgentTools(walletAddress: string, walletPrivateKey?: string) {
  return {
    // Market discovery (read-only, no wallet needed)
    getMarkets: getMarketsTool,
    getMarketDetails: getMarketDetailsTool,
    getLiveData: getLiveDataTool,
    
    // Portfolio (needs wallet address for queries)
    getPositions: createGetPositionsTool(walletAddress),
    getBalance: createGetBalanceTool(walletAddress),
    getTradeHistory: createGetTradeHistoryTool(walletAddress),
    
    // Trade execution (needs private key for signing)
    placeOrder: createPlaceOrderTool(walletAddress, walletPrivateKey),
    getOrderStatus: getOrderStatusTool,
    cancelOrder: createCancelOrderTool(walletAddress, walletPrivateKey),
  };
}
```

---

### Phase 3: Trading System Prompt

**File**: `lib/ai/agents/prompts/tradingPrompt.ts`

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

---

### Phase 4: Price Swing Detection

**Goal**: Only trigger agents when prices move significantly.

#### 4.1 Add database tables

```sql
CREATE TABLE market_prices (
  ticker TEXT PRIMARY KEY,
  yes_bid NUMERIC,
  yes_ask NUMERIC,
  no_bid NUMERIC,
  no_ask NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE market_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT,
  yes_mid NUMERIC,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_history_time ON market_price_history(recorded_at DESC);
```

#### 4.2 Trading configuration

**File**: `lib/config.ts`

```typescript
export const TRADING_CONFIG = {
  // Swing detection
  swingThreshold: 0.05,        // 5% price change triggers agents
  lookbackMinutes: 5,          // Compare to price N minutes ago
  
  // Agent execution
  maxStepsPerAgent: 5,         // Max tool calls per agent run
  
  // Risk limits (enforced in prompt, can add code checks)
  maxPositionPercent: 0.20,    // Max 20% of portfolio per position
  minConfidence: 0.70,         // Only trade with 70%+ conviction
  
  // Cooldowns
  minTimeBetweenRuns: 60,      // Seconds between cron runs
} as const;
```

#### 4.3 Price sync and swing detection

**File**: `lib/supabase/prices.ts`

```typescript
interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

export async function syncPricesAndDetectSwings(
  currentPrices: MarketPrice[],
  threshold: number
): Promise<PriceSwing[]> {
  const supabase = getServerClient();
  
  // Get previous prices
  const { data: lastPrices } = await supabase
    .from("market_prices")
    .select("ticker, yes_bid, yes_ask");
  
  const lastPriceMap = new Map(
    lastPrices?.map(p => [p.ticker, (p.yes_bid + p.yes_ask) / 2]) || []
  );
  
  // Detect swings
  const swings: PriceSwing[] = [];
  for (const price of currentPrices) {
    const currentMid = (price.yes_bid + price.yes_ask) / 2;
    const previousMid = lastPriceMap.get(price.ticker);
    
    if (previousMid) {
      const changePercent = Math.abs(currentMid - previousMid) / previousMid;
      if (changePercent >= threshold) {
        swings.push({
          ticker: price.ticker,
          previousPrice: previousMid,
          currentPrice: currentMid,
          changePercent,
        });
      }
    }
  }
  
  // Update prices
  await supabase.from("market_prices").upsert(
    currentPrices.map(p => ({
      ticker: p.ticker,
      yes_bid: p.yes_bid,
      yes_ask: p.yes_ask,
      no_bid: p.no_bid,
      no_ask: p.no_ask,
      updated_at: new Date().toISOString(),
    }))
  );
  
  return swings;
}
```

---

### Phase 5: Update Cron Job

**File**: `app/api/cron/trading/route.ts`

```typescript
export async function GET(req: Request) {
  // Auth check...
  
  // 1. Fetch current prices from dflow
  const currentPrices = await fetchDflowPrices();
  
  // 2. Sync prices and detect swings
  const swings = await syncPricesAndDetectSwings(
    currentPrices,
    TRADING_CONFIG.swingThreshold
  );
  
  // 3. If no significant swings, skip agent runs (save cost)
  if (swings.length === 0) {
    return NextResponse.json({ message: "No significant price movements", swings: 0 });
  }
  
  // 4. Get models with wallets
  const models = getModelsWithWallets();
  if (models.length === 0) {
    return NextResponse.json({ message: "No models with wallets configured" });
  }
  
  // 5. Get global session
  const session = await getGlobalSession();
  
  // 6. Run agent for each model
  const results = await Promise.allSettled(
    models.map(async (model) => {
      const agent = new PredictionMarketAgent({
        modelId: model.id,
        modelIdentifier: model.id,
        walletAddress: model.walletAddress!,
        walletPrivateKey: getWalletPrivateKey(model.id),
        sessionId: session.id,
      });
      
      const context = await buildMarketContext(model.walletAddress!, swings);
      return agent.executeTradingLoop(context);
    })
  );
  
  return NextResponse.json({
    swings: swings.length,
    modelsRun: models.length,
    results: results.map(r => r.status),
  });
}
```

---

### Phase 6: Cron Interval Update

**File**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/snapshots",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/trading",
      "schedule": "* * * * *"
    }
  ]
}
```

**Note**: 1-minute cron requires Vercel Pro plan.

---

## Implementation Order

1. **Phase 1**: Wallet configuration (prerequisite)
2. **Phase 2**: Refactor PredictionMarketAgent class
3. **Phase 3**: Add trading system prompt
4. **Phase 4**: Price swing detection
5. **Phase 5**: Update cron job
6. **Phase 6**: Deploy with 1-min cron

---

## Files to Modify

| File | Changes |
|------|---------|
| `lib/ai/models/catalog.ts` | Add `walletAddress` from env vars per model |
| `lib/ai/agents/predictionMarketAgent.ts` | Refactor to agentic loop, remove deprecated methods |
| `lib/ai/tools/index.ts` | Add `createAgentTools()` factory |
| `lib/ai/tools/trade-execution/placeOrder.ts` | Add wallet context injection |
| `lib/ai/tools/portfolio-management/*.ts` | Add wallet context injection |
| `app/api/cron/trading/route.ts` | Add swing detection, use refactored agent |
| `lib/config.ts` | Add `TRADING_CONFIG` |
| `vercel.json` | Update cron to 1-minute |
| `types/db.ts` | Update `PredictionMarketAgentConfig` to include `walletPrivateKey` |

## New Files

| File | Purpose |
|------|---------|
| `lib/ai/agents/prompts/tradingPrompt.ts` | System prompt for trading agent |
| `lib/supabase/prices.ts` | Price storage and swing detection |

## Database Changes

| Table | Purpose |
|-------|---------|
| `market_prices` | Current price snapshot per market |
| `market_price_history` | Historical prices for swing detection |

---

## Directory Structure

```
lib/
├── ai/
│   ├── models/
│   │   ├── catalog.ts          # Model definitions + wallet addresses
│   │   └── index.ts
│   ├── agents/
│   │   ├── predictionMarketAgent.ts  # Main agent class (agentic loop)
│   │   ├── chatAgent.ts              # Chat responses
│   │   └── prompts/
│   │       └── tradingPrompt.ts      # Trading system prompt
│   └── tools/
│       ├── index.ts                  # createAgentTools() factory
│       ├── market-discovery/         # getMarkets, getMarketDetails, getLiveData
│       ├── trade-execution/          # placeOrder, getOrderStatus, cancelOrder
│       └── portfolio-management/     # getPositions, getBalance, getTradeHistory
├── supabase/
│   ├── db.ts                   # Main DB functions
│   └── prices.ts               # Price sync + swing detection
└── config.ts                   # TRADING_CONFIG + existing config

app/api/cron/
├── snapshots/route.ts          # Performance snapshots (every 5 min)
└── trading/route.ts            # Autonomous trading loop (every 1 min)
```
