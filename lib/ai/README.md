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
│   ├── trading/
│   │   ├── systemPrompt.ts        # Trading agent identity
│   │   └── promptBuilder.ts       # Lean prompt builder (signal + balance)
│   └── chat/
│       └── assistantPrompt.ts     # Chat assistant prompt
├── guardrails/                # Risk control & validation
│   ├── index.ts                   # Guardrails exports
│   ├── types.ts                   # RiskLimits, TradingMiddlewareConfig
│   ├── riskLimits.ts              # Pre-trade validation
│   └── middleware.ts              # LLM-level limits (maxTokens, maxToolCalls)
├── tools/                     # AI SDK tools for agent capabilities
│   ├── index.ts                   # Direct tool exports (no factory)
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
    ├── signalListener.ts          # Long-running signal listener
    └── tradingAgent.ts            # Durable trading workflow

party/
└── dflow-relay.ts             # PartyKit WebSocket relay to dflow
```

## Design Decisions

| Decision          | Choice                          | Rationale                               |
| ----------------- | ------------------------------- | --------------------------------------- |
| Tool creation     | Direct imports in agent         | Clearer dependencies, simpler code      |
| Context injection | Signer passed at agent level    | Only signer needed for trading tools    |
| Prompt strategy   | Lean context (signal + balance) | Agent discovers via tools, fresher data |
| Market fetching   | Agent uses discoverEvent        | No stale pre-fetched data               |
| Agent tools       | dflow API (on-chain truth)      | Trading decisions need real-time data   |
| UI hooks          | Supabase (recorded data)        | Display uses single source of truth     |

## Trading Workflow

The trading system uses a durable workflow with 5 steps:

1. **Get session** - Fetch global trading session
2. **Get agent session** - Get or create agent session for this model
3. **Get USDC balance** - Single RPC call for available trading capital
4. **Run agent** - Agent discovers markets via tools, executes trades
   - Trade tools (`increasePosition`, `decreasePosition`) wait for confirmation
   - `retrievePosition` uses dflow API for on-chain truth
   - Sync trades: confirmed via RPC `getSignatureStatuses`
   - Async trades: polled via dflow `/order-status` endpoint
5. **Record results** - Atomically write to Supabase:
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
   (dflow API)          (Supabase)            (Supabase)
         │                    │                    │
         ▼                    ▼                    ▼
   On-chain truth       Single writer         Realtime updates
   for trading          for all data          for display
```

### Usage

```typescript
import { tradingAgentWorkflow } from "@/lib/ai/workflows";

// Workflow is triggered via POST /api/chat
const input = {
  modelId: "openai/gpt-5.2",
  walletAddress: "...",
  signal: { type: "price_swing", ticker: "BTC", ... }  // Optional
};

// Returns streaming response with x-workflow-run-id header
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

### AgentRunInput (Lean Context)

```typescript
interface AgentRunInput {
  signal?: MarketSignal; // Optional signal from PartyKit
  usdcBalance: number; // Current USDC balance
  testMode?: boolean; // Force small trade for testing
}
```

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

### MarketSignal

```typescript
interface MarketSignal {
  type: "price_swing" | "volume_spike";
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
}
```

**Note**: `orderbook_imbalance` was disabled as it's too noisy for position management.

## Tools

Tools are imported directly in the agent - no factory pattern.

### Tool Exports

```typescript
// lib/ai/tools/index.ts

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
| `discoverEvent`    | Discover events with markets | query, category, event_ticker    | events[], markets[]        |
| `increasePosition` | Buy YES/NO tokens            | market_ticker, side, usdc_amount | filled_quantity, signature |
| `decreasePosition` | Sell YES/NO tokens           | market_ticker, side, quantity    | sold_quantity, signature   |
| `retrievePosition` | Get current positions        | market_ticker (optional)         | positions[], summary       |
| `redeemPosition`   | Redeem winning tokens        | market_ticker, side              | payout_amount, signature   |

**Note**: `retrievePosition` uses dflow API (on-chain truth) for trading decisions. UI uses Supabase `agent_positions` table for display.

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

## Prompt Builder

The lean prompt builder provides minimal context - agent discovers details via tools.

```typescript
import { buildTradingPrompt } from "@/lib/ai/prompts/trading/promptBuilder";

// Signal-triggered prompt
const prompt = buildTradingPrompt({
  signal: {
    type: "price_swing",
    ticker: "BTC-100K-2024",
    data: { previousPrice: 0.45, currentPrice: 0.52, changePercent: 0.155 },
    timestamp: Date.now(),
  },
  usdcBalance: 100.0,
});

// Periodic scan prompt (no signal)
const prompt = buildTradingPrompt({
  usdcBalance: 100.0,
});
```

## Agent Implementation

The agent uses direct tool imports - no factory.

```typescript
// lib/ai/agents/predictionMarketAgent.ts

import { discoverEventTool } from "@/lib/ai/tools/discoverEvent";
import { createIncreasePositionTool } from "@/lib/ai/tools/increasePosition";
import { createDecreasePositionTool } from "@/lib/ai/tools/decreasePosition";
import { createRetrievePositionTool } from "@/lib/ai/tools/retrievePosition";
import { createRedeemPositionTool } from "@/lib/ai/tools/redeemPosition";

async run(input: AgentRunInput): Promise<TradingResult> {
  // Create signer
  const signer = this.config.privateKey
    ? await createSignerFromBase58PrivateKey(this.config.privateKey)
    : undefined;

  // Create tools directly
  const tools = {
    discoverEvent: discoverEventTool,
    increasePosition: createIncreasePositionTool(this.config.walletAddress, signer),
    decreasePosition: createDecreasePositionTool(this.config.walletAddress, signer),
    retrievePosition: createRetrievePositionTool(this.config.walletAddress),
    redeemPosition: createRedeemPositionTool(this.config.walletAddress, signer),
  };

  // Build lean prompt
  const prompt = buildTradingPrompt({
    signal: input.signal,
    usdcBalance: input.usdcBalance,
  });

  // Run agent...
}
```

## Workflow Implementation

The workflow fetches only USDC balance - agent discovers markets via tools.

```typescript
// lib/ai/workflows/tradingAgent.ts

interface TradingInput {
  modelId: string;
  walletAddress: string;
  signal?: MarketSignal;
  testMode?: boolean;
}

// Get USDC balance (single RPC call)
async function getUsdcBalanceStep(walletAddress: string): Promise<number> {
  "use step";
  const balance = await getCurrencyBalance(walletAddress, "USDC");
  return balance ? parseFloat(balance.formatted) : 0;
}

// Record all results atomically
async function recordResultsStep(...): Promise<void> {
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

# Model wallet keys
WALLET_GPT4O_PUBLIC=<solana-public-key>
WALLET_GPT4O_PRIVATE=<solana-private-key>

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
              getUsdcBalanceStep               runAgentStep           recordResultsStep
                    │                                │                        │
                    ▼                                ▼                        ▼
              Single RPC call              Agent uses tools           Supabase writes:
              (USDC balance)               (discoverEvent,            • agent_decisions
                                            increasePosition,          • agent_trades
                                            retrievePosition)          • agent_positions
                                                     │                 • agent_sessions
                                                     ▼                        │
                                               Trade execution                ▼
                                               (waits for               Realtime updates
                                                confirmation)           to UI hooks
```

## Agent Trigger Architecture

The trigger system separates **position management** (real-time, filtered) from **market discovery** (periodic cron).

### Trigger Types

| Trigger Type       | Purpose                       | Frequency      | Which Agents                           |
| ------------------ | ----------------------------- | -------------- | -------------------------------------- |
| **Cron**           | Market discovery + portfolio  | Every 5 min    | All agents                             |
| **Position Signal**| React to held position moves  | Real-time      | Only agents holding that ticker        |

### Signal Detection (dflow-relay)

The PartyKit relay (`party/dflow-relay.ts`) monitors dflow WebSocket and detects:

| Signal         | Threshold   | Use Case                    |
| -------------- | ----------- | --------------------------- |
| `price_swing`  | 10% change  | Position P&L impact         |
| `volume_spike` | 10x average | Momentum/news indicator     |

### Position Filtering

When `filterByPosition: true` is passed to the trigger endpoint:

1. Query `agent_positions` table to find agents holding the ticker
2. Filter to only agents with positive quantity
3. Skip agents that already have an active workflow running

```typescript
// lib/supabase/agents.ts
getAgentHeldTickers(agentSessionId)   // → ["BTC-100K", "ETH-5K"]
getAgentsHoldingTicker(sessionId, ticker) // → ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"]
```

### Key Constraints

1. **One workflow per agent at a time** - Skip triggers if agent already has active workflow
2. **Positions tracked in `agent_positions`** - Delta-based updates from trades
3. **Filtered signals** - Only `price_swing` (10%) and `volume_spike` (10x) for positions
