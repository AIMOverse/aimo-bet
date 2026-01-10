# AI Module

Autonomous trading agents and LLM infrastructure for Alpha Arena prediction market competition.

## Architecture

```
lib/ai/
├── agents/                    # Agent implementations
│   ├── predictionMarketAgent.ts   # Trading agent with direct tool imports
│   ├── types.ts                   # AgentConfig, AgentRunInput, TradingResult
│   └── index.ts                   # Agent exports
├── prompts/                   # System prompts
│   ├── index.ts                   # Prompt exports
│   └── trading/
│       └── systemPrompt.ts        # Trading agent identity + workflow hints
├── guardrails/                # Risk control & validation
│   ├── index.ts                   # Guardrails exports
│   ├── types.ts                   # RiskLimits, TradingMiddlewareConfig
│   ├── riskLimits.ts              # Pre-trade validation
│   └── middleware.ts              # LLM-level limits (maxTokens, maxToolCalls)
├── tools/                     # AI SDK tools for agent capabilities
│   ├── index.ts                   # Direct tool exports (no factory)
│   ├── getBalance.ts              # Get USDC balance (KV cache friendly)
│   ├── discoverEvent.ts           # Event-centric market discovery
│   ├── increasePosition.ts        # Buy YES/NO tokens
│   ├── decreasePosition.ts        # Sell YES/NO tokens
│   ├── retrievePosition.ts        # Get current positions (dflow API)
│   ├── redeemPosition.ts          # Redeem winning positions
│   └── utils/
│       └── resolveMints.ts        # Market ticker → mint address resolution
├── models/                    # Model catalog and providers
│   ├── catalog.ts                 # Model definitions with wallet addresses
│   ├── providers.ts               # Provider configurations
│   ├── registry.ts                # Model access via AI SDK
│   ├── openrouter.ts              # OpenRouter provider instance
│   └── aimo.ts                    # AIMO provider instance
└── workflows/                 # Durable workflows (main entry point)
    ├── index.ts                   # Workflow exports
    └── tradingAgent.ts            # Durable trading workflow

party/
└── dflow-relay.ts             # PartyKit WebSocket relay to dflow
```

## Design Decisions

| Decision            | Choice                              | Rationale                             |
| ------------------- | ----------------------------------- | ------------------------------------- |
| Tool creation       | Direct imports in agent             | Clearer dependencies, simpler code    |
| Context injection   | Signer passed at agent level        | Only signer needed for trading tools  |
| **Prompt strategy** | **Static prompt + getBalance tool** | **KV cache optimization**             |
| Market fetching     | Agent uses discoverEvent            | No stale pre-fetched data             |
| Agent tools         | dflow API (on-chain truth)          | Trading decisions need real-time data |
| UI hooks            | Supabase (recorded data)            | Display uses single source of truth   |

## KV Cache Optimization

The agent uses a **static system prompt** for KV cache efficiency:

```
Before (cache-unfriendly):
  Workflow → fetch balance → build dynamic prompt with balance → Agent

After (cache-optimized):
  Workflow → Agent (static prompt) → Agent calls getBalance tool → proceeds
```

**Benefits:**

- System prompt is fully cacheable across runs
- Balance comes in as tool result (appends to cache, doesn't invalidate prefix)
- Reduces inference costs and latency

**Implementation:**

- `TRADING_SYSTEM_PROMPT` is static (no dynamic values)
- Agent calls `getBalance` tool as first step to get current USDC balance
- Signals are used for triggering/filtering only, NOT passed to LLM prompt

## Trading Workflow

The trading system uses a durable workflow with 4 steps:

1. **Get session** - Fetch global trading session
2. **Get agent session** - Get or create agent session for this model
3. **Run agent** - Agent discovers markets and balance via tools, executes trades
   - `getBalance` tool fetches USDC balance (KV cache friendly)
   - `discoverEvent` discovers active markets
   - `retrievePosition` uses dflow API for on-chain truth
   - Trade tools (`increasePosition`, `decreasePosition`) wait for confirmation
4. **Record results** - Atomically write to Supabase:
   - `agent_decisions` - Decision record (triggers Realtime for chat)
   - `agent_trades` - Trade records (triggers Realtime for trades feed)
   - `agent_positions` - Delta-based position upserts (triggers Realtime for positions)
   - `agent_sessions` - Update portfolio value for leaderboard

### Data Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Trading Workflow                             │
│  (Single writer for all agent data)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   Agent Tools          Record Results        UI Hooks
   (dflow API + RPC)    (Supabase)            (Supabase)
         │                    │                    │
         ▼                    ▼                    ▼
   On-chain truth       Single writer         Realtime updates
   for trading          for all data          for display
```

### Usage

```typescript
import { tradingAgentWorkflow } from "@/lib/ai/workflows";

// Workflow is triggered via POST /api/agents/trigger
const input = {
  modelId: "openai/gpt-5.2",
  walletAddress: "...",
};

// Returns TradingResult with reasoning, trades, decision
```

## Agent Types

### AgentConfig

```typescript
interface AgentConfig {
  modelId: string;
  walletAddress: string;
  privateKey?: string;
  maxSteps?: number;
}
```

### AgentRunInput (Minimal for KV Cache)

```typescript
interface AgentRunInput {
  // Currently empty - agent uses tools for all context
}
```

**Note:** Balance and signals are NOT passed in input. Agent fetches balance via `getBalance` tool.

### ExecutedTrade

```typescript
interface ExecutedTrade {
  id: string;
  marketTicker: string;
  marketTitle?: string;
  side: PositionSide;
  action: TradeAction; // 'buy' | 'sell' | 'redeem'
  quantity: number;
  price: number;
  notional: number;
  mint?: string; // For position tracking
}
```

### MarketSignal (Trigger Only)

```typescript
// Defined in app/api/agents/trigger/route.ts
// Used for triggering agents, NOT passed to LLM prompt
interface MarketSignal {
  type: "price_swing" | "volume_spike" | "orderbook_imbalance";
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
}
```

**Note:** Signals are used to decide _when_ to trigger agents and filter by position. They are NOT passed to the LLM prompt (for KV cache optimization).

## Tools

Tools are imported directly in the agent - no factory pattern.

### Tool Exports

```typescript
// lib/ai/tools/index.ts

// Balance Check (KV cache friendly)
export { createGetBalanceTool } from "./getBalance";

// Market Discovery
export { discoverEventTool } from "./discoverEvent";

// Position Management - creators that accept signer
export { createIncreasePositionTool } from "./increasePosition";
export { createDecreasePositionTool } from "./decreasePosition";
export { createRetrievePositionTool } from "./retrievePosition";
export { createRedeemPositionTool } from "./redeemPosition";

// Utilities
export {
  resolveMints,
  getTradeMintsForBuy,
  getTradeMintsForSell,
} from "./utils/resolveMints";
```

### Tool Overview

| Tool               | Purpose                      | Input                            | Output                     |
| ------------------ | ---------------------------- | -------------------------------- | -------------------------- |
| `getBalance`       | Get USDC balance             | currency (default: USDC)         | balance, wallet, timestamp |
| `discoverEvent`    | Discover events with markets | query, category, event_ticker    | events[], markets[]        |
| `increasePosition` | Buy YES/NO tokens            | market_ticker, side, usdc_amount | filled_quantity, signature |
| `decreasePosition` | Sell YES/NO tokens           | market_ticker, side, quantity    | sold_quantity, signature   |
| `retrievePosition` | Get current positions        | market_ticker (optional)         | positions[], summary       |
| `redeemPosition`   | Redeem winning tokens        | market_ticker, side              | payout_amount, signature   |

**Note:** `retrievePosition` uses dflow API (on-chain truth) for trading decisions. UI uses Supabase `agent_positions` table for display.

### getBalance

Get USDC balance for trading decisions. This is the first tool the agent calls.

```typescript
const result = await getBalance({});

// Response
{
  success: true,
  wallet: "...",
  balance: 95.50,
  currency: "USDC",
  timestamp: "2024-01-15T10:30:00Z"
}
```

### discoverEvent

Discover prediction market events with nested markets.

```typescript
// Browse active markets
const result = await discoverEvent({});

// Filter by category
const result = await discoverEvent({ category: "crypto" });

// Get specific event
const result = await discoverEvent({ event_ticker: "BTCD-25DEC0313" });

// Response
{
  success: true,
  events: [...],
  total_events: 10,
  total_markets: 25,
  available_categories: ["crypto", "sports", "politics"]
}
```

### increasePosition

Buy YES or NO outcome tokens.

```typescript
const result = await increasePosition({
  market_ticker: "BTC-100K-2024",
  side: "yes",
  usdc_amount: 10,
  slippage_bps: 200,
});

// Response
{
  success: true,
  filled_quantity: 20.5,
  avg_price: 0.488,
  total_cost: 10.0,
  signature: "5KKs..."
}
```

### decreasePosition

Sell YES or NO outcome tokens.

```typescript
const result = await decreasePosition({
  market_ticker: "BTC-100K-2024",
  side: "yes",
  quantity: 10,
  slippage_bps: 200,
});

// Response
{
  success: true,
  sold_quantity: 10,
  avg_price: 0.52,
  total_proceeds: 5.2,
  signature: "7JKp..."
}
```

### retrievePosition

Get current positions from on-chain data (dflow API).

```typescript
const result = await retrievePosition({});

// Response
{
  success: true,
  positions: [
    { market_ticker: "BTC-100K-2024", side: "yes", quantity: 15.5 }
  ],
  summary: { total_positions: 1, active_positions: 1 }
}
```

### redeemPosition

Redeem winning tokens after market resolution.

```typescript
const result = await redeemPosition({
  market_ticker: "BTC-100K-2024",
  side: "yes"
});

// Response
{
  success: true,
  payout_amount: 15.5,
  signature: "9LMn..."
}
```

## System Prompt

The system prompt is static for KV cache optimization. Agent workflow hints guide tool usage.

```typescript
// lib/ai/prompts/trading/systemPrompt.ts

export const TRADING_SYSTEM_PROMPT = `You are an autonomous prediction market trader...

## Tools Available

- **getBalance** - Check your USDC balance for trading
- **discoverEvent** - Browse active prediction markets
- **retrievePosition** - Check your current positions
- **increasePosition** - Buy YES/NO tokens
- **decreasePosition** - Sell YES/NO tokens
- **redeemPosition** - Redeem winning positions after market resolution
- **webSearch** - Research market topics

## Workflow

1. Check your balance with getBalance
2. Review your positions with retrievePosition
3. Discover markets with discoverEvent
4. Research with webSearch if needed
5. Trade if you have >70% confidence

## Trading Rules
...`;
```

## Agent Implementation

The agent uses direct tool imports and static prompts.

```typescript
// lib/ai/agents/predictionMarketAgent.ts

import { createGetBalanceTool } from "@/lib/ai/tools/getBalance";
import { discoverEventTool } from "@/lib/ai/tools/discoverEvent";
import { createIncreasePositionTool } from "@/lib/ai/tools/increasePosition";
// ... other tool imports

async run(input: AgentRunInput): Promise<TradingResult> {
  // Create signer
  const signer = this.config.privateKey
    ? await createSignerFromBase58PrivateKey(this.config.privateKey)
    : undefined;

  // Create tools directly (including getBalance for KV cache optimization)
  const tools = {
    getBalance: createGetBalanceTool(this.config.walletAddress),
    discoverEvent: discoverEventTool,
    increasePosition: createIncreasePositionTool(this.config.walletAddress, signer),
    decreasePosition: createDecreasePositionTool(this.config.walletAddress, signer),
    retrievePosition: createRetrievePositionTool(this.config.walletAddress),
    redeemPosition: createRedeemPositionTool(this.config.walletAddress, signer),
    webSearch: webSearchTool,
  };

  // Static prompt for KV cache optimization
  const prompt = "Analyze prediction markets and execute trades if you find opportunities with >70% confidence.";

  // Run agent - it will call getBalance tool to fetch balance
  const result = await agent.generate({ prompt });

  // Extract portfolio value from getBalance tool result
  const portfolioValue = this.extractBalanceFromSteps(result.steps);

  // ...
}
```

## Workflow Implementation

The workflow is simplified - no balance fetching step. Agent fetches via tool.

```typescript
// lib/ai/workflows/tradingAgent.ts

interface TradingInput {
  modelId: string;
  walletAddress: string;
}

// Step 3: Run agent (fetches balance via getBalance tool)
async function runAgentStep(input: TradingInput): Promise<TradingResult> {
  "use step";

  const agent = new PredictionMarketAgent({
    modelId: input.modelId,
    walletAddress: input.walletAddress,
    privateKey: getWalletPrivateKey(input.modelId),
    maxSteps: 10,
  });

  // Agent will call getBalance tool to fetch current balance
  return await agent.run({});
}

// Step 4: Record all results atomically
async function recordResultsStep(
  agentSession: AgentSession,
  result: TradingResult,
): Promise<void> {
  "use step";

  // 1. Record decision
  const decision = await recordAgentDecision({...});

  // 2. Record trades + update positions
  for (const trade of result.trades) {
    await recordAgentTrade({...});

    // Delta-based position update
    const quantityDelta = trade.action === "buy"
      ? trade.quantity
      : -trade.quantity;

    await upsertAgentPosition({
      agentSessionId,
      marketTicker: trade.marketTicker,
      side: trade.side,
      mint: trade.mint || "",
      quantityDelta,
    });
  }

  // 3. Update session value for leaderboard
  await updateAgentSessionValue(agentSessionId, portfolioValue, pnl);
}
```

## Guardrails

Two-layer risk control system:

### Pre-Trade Validation

```typescript
import { validateTrade } from "@/lib/ai/guardrails";

const result = validateTrade(tradeSize, marketId, portfolio);
// Returns: { approved: boolean, reason?: string }
```

### LLM-Level Limits

```typescript
import { createTradingMiddleware } from "@/lib/ai/guardrails";

const middleware = createTradingMiddleware({
  maxTokens: 4096,
  maxToolCalls: 20,
  maxTradesPerRun: 3,
});
```

## Environment Variables

```bash
# OpenRouter API
OPENROUTER_API_KEY=...

# dflow API
DFLOW_API_KEY=...

# Model wallet keys (Solana/SVM)
WALLET_GPT_SVM_PUBLIC=<solana-public-key>
WALLET_GPT_SVM_PRIVATE=<solana-private-key>

# Security
ADMIN_SECRET=...
CRON_SECRET=...
```

## Data Flow

```
Signal (PartyKit) → POST /api/agents/trigger → tradingAgentWorkflow
                                                     │
                    ┌────────────────────────────────┼────────────────────────┐
                    ▼                                ▼                        ▼
              getSessionStep                   runAgentStep           recordResultsStep
                    │                                │                        │
                    ▼                                ▼                        ▼
              Supabase                      Agent uses tools           Supabase writes:
              (session)                     • getBalance (RPC)         • agent_decisions
                                            • discoverEvent            • agent_trades
                                            • increasePosition         • agent_positions
                                            • retrievePosition         • agent_sessions
                                                     │                        │
                                                     ▼                        ▼
                                               Trade execution          Realtime updates
                                               (waits for               to UI hooks
                                                confirmation)
```

## Agent Trigger Architecture

The trigger system separates **position management** (real-time, filtered) from **market discovery** (periodic cron).

### Trigger Types

| Trigger Type        | Purpose                      | Frequency   | Which Agents                    |
| ------------------- | ---------------------------- | ----------- | ------------------------------- |
| **Cron**            | Market discovery + portfolio | Every 5 min | All agents                      |
| **Position Signal** | React to held position moves | Real-time   | Only agents holding that ticker |

**Note:** Signals are used for triggering/filtering only. They are NOT passed to the LLM prompt (for KV cache optimization).

### Signal Detection (dflow-relay)

The PartyKit relay (`party/dflow-relay.ts`) monitors dflow WebSocket and detects:

| Signal         | Threshold   | Use Case                |
| -------------- | ----------- | ----------------------- |
| `price_swing`  | 10% change  | Position P&L impact     |
| `volume_spike` | 10x average | Momentum/news indicator |

### Position Filtering

When `filterByPosition: true` is passed to the trigger endpoint:

1. Query `agent_positions` table to find agents holding the ticker
2. Filter to only agents with positive quantity
3. Skip agents that already have an active workflow running

```typescript
// lib/supabase/agents.ts
getAgentHeldTickers(agentSessionId); // → ["BTC-100K", "ETH-5K"]
getAgentsHoldingTicker(sessionId, ticker); // → ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"]
```

### Key Constraints

1. **One workflow per agent at a time** - Skip triggers if agent already has active workflow
2. **Positions tracked in `agent_positions`** - Delta-based updates from trades
3. **Filtered signals** - Only `price_swing` (10%) and `volume_spike` (10x) for positions
4. **KV cache optimization** - Signals NOT passed to LLM prompt
