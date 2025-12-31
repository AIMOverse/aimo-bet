# AI Module

Autonomous trading agents and LLM infrastructure for Alpha Arena prediction market competition.

## Architecture

```
lib/ai/
├── agents/                    # Agent types (implementations moved to workflows)
│   ├── types.ts                   # PredictionMarketAgentConfig, MarketContext, etc.
│   └── index.ts                   # Type exports only
├── prompts/                   # System prompts (top-level)
│   ├── index.ts                   # Prompt exports
│   ├── trading/
│   │   ├── systemPrompt.ts        # Trading agent identity
│   │   └── contextBuilder.ts      # Market context → prompt
│   └── chat/
│       └── assistantPrompt.ts     # Chat assistant prompt
├── guardrails/                # Risk control & validation
│   ├── index.ts                   # Guardrails exports
│   ├── types.ts                   # RiskLimits, TradingMiddlewareConfig
│   ├── riskLimits.ts              # Pre-trade validation
│   └── middleware.ts              # LLM-level limits (maxTokens, maxToolCalls)
├── tools/                     # AI SDK tools for agent capabilities
│   ├── index.ts                   # Tool factory with wallet/signer injection
│   ├── discoverEvent.ts           # Event-centric market discovery (dflow-based)
│   ├── portfolio-management/      # getBalance, getTradeHistory
│   ├── increasePosition.ts        # Buy YES/NO tokens (dflow-based)
│   ├── decreasePosition.ts        # Sell YES/NO tokens (dflow-based)
│   ├── retrievePosition.ts        # Get current positions (dflow-based)
│   ├── redeemPosition.ts          # Redeem winning positions (dflow-based)
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
    ├── signalListener.ts          # Long-running hook-based signal listener (per model)
    └── tradingAgent.ts            # DurableAgent-based trading execution

party/
└── dflow-relay.ts             # PartyKit WebSocket relay to dflow
```

## DurableAgent Workflow

The trading system uses a single `DurableAgent` workflow that:

1. **Streams AI-SDK format** - `UIMessageChunk` compatible with `useChat`
2. **Durable tool execution** - Tools marked with `"use step"` are retryable
3. **Resumable streams** - Clients can reconnect via `WorkflowChatTransport`
4. **Records decisions** - Writes to `agent_decisions` table (triggers Realtime)

### Usage

```typescript
import { tradingAgentWorkflow } from "@/lib/ai/workflows";

// Workflow is triggered via POST /api/chat
const input = {
  modelId: "openrouter/gpt-4o",
  walletAddress: "...",
  priceSwings: [...],
  signal: { type: "price_swing", ticker: "BTC", ... }
};

// Returns streaming response with x-workflow-run-id header
```

## Market Discovery Tool

The `discoverEvent` tool provides event-centric market discovery using the dflow Prediction Market Metadata API.

### discoverEvent

Discover prediction market events with nested markets. Primary discovery tool for finding trading opportunities.

```typescript
// Browse active markets
const result = await discoverEvent({});

// Filter by category
const result = await discoverEvent({ category: "crypto" });

// Search by query
const result = await discoverEvent({ query: "bitcoin price" });

// Get specific event
const result = await discoverEvent({ event_ticker: "BTCD-25DEC0313" });

// Drill down by series
const result = await discoverEvent({ series_ticker: "BTCD-DAILY", limit: 5 });

// Response
{
  success: true,
  events: [
    {
      event_ticker: "BTCD-25DEC0313",
      event_title: "Bitcoin Daily 2025-03-13",
      series_ticker: "BTCD-DAILY",
      category: "crypto",
      tags: ["bitcoin", "price"],
      markets: [
        {
          market_ticker: "BTC-100K-2024",
          title: "BTC above $100K?",
          status: "active",
          yes_mint: "YES...",
          no_mint: "NO...",
          volume_24h: 50000,
          open_interest: 120000
        }
      ],
      market_count: 1,
      total_volume: 50000
    }
  ],
  total_events: 1,
  total_markets: 1,
  filters_applied: { category: "crypto" },
  has_more: false,
  price_note: "Prices are indicative snapshots. Actual execution prices may differ.",
  available_categories: ["crypto", "sports", "politics"],
  available_series: [{ ticker: "BTCD-DAILY", title: "Bitcoin Daily" }]
}
```

**Input Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string? | Search terms to match against event/market titles |
| `category` | string? | Filter by category: crypto, sports, politics, entertainment |
| `tags` | string[]? | Filter by tags (e.g., ['bitcoin', 'price']) |
| `series_ticker` | string? | Filter to specific series (e.g., 'BTCD-DAILY') |
| `event_ticker` | string? | Get details for a specific event by ticker |
| `status` | enum? | Filter by market status: active, initialized, determined, finalized (default: active) |
| `limit` | number? | Maximum events to return (default: 10, max: 50) |
| `cursor` | string? | Pagination cursor from previous response |

## Position Management Tools

The trading tools use direct dflow library calls for real-time position management:

### Tool Overview

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `discoverEvent` | Discover events with nested markets | query, category, tags, series_ticker, event_ticker, status, limit, cursor | events[], total_events, total_markets, available_categories, available_series |
| `increasePosition` | Buy YES/NO tokens | market_ticker, side, usdc_amount OR quantity, slippage_bps | filled_quantity, avg_price, total_cost, signature |
| `decreasePosition` | Sell YES/NO tokens | market_ticker, side, quantity, slippage_bps | sold_quantity, avg_price, total_proceeds, signature |
| `retrievePosition` | Get current positions | market_ticker (optional) | positions[], summary |
| `redeemPosition` | Redeem winning tokens | market_ticker, side, quantity (optional) | payout_amount, signature |

### increasePosition

Buy YES or NO outcome tokens to open or increase a position.

```typescript
// Buy $10 worth of YES tokens
const result = await increasePosition({
  market_ticker: "BTC-100K-2024",
  side: "yes",
  usdc_amount: 10,
  slippage_bps: 200,  // 2%
});

// Or buy a specific quantity
const result = await increasePosition({
  market_ticker: "BTC-100K-2024",
  side: "no",
  quantity: 5,  // 5 tokens
  slippage_bps: 200,
});

// Response
{
  success: true,
  market_ticker: "BTC-100K-2024",
  side: "yes",
  resolved_mints: { input_mint: "EPjF...", output_mint: "YES..." },
  filled_quantity: 20.5,
  avg_price: 0.488,
  total_cost: 10.0,
  signature: "5KKs...",
  execution_mode: "sync"
}
```

### decreasePosition

Sell YES or NO outcome tokens to reduce or close a position.

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
  market_ticker: "BTC-100K-2024",
  side: "yes",
  resolved_mints: { input_mint: "YES...", output_mint: "EPjF..." },
  sold_quantity: 10,
  avg_price: 0.52,
  total_proceeds: 5.2,
  signature: "7JKp...",
  execution_mode: "sync"
}
```

### retrievePosition

Get current prediction market positions for the wallet.

```typescript
// Get all positions
const result = await retrievePosition({});

// Or filter by market
const result = await retrievePosition({
  market_ticker: "BTC-100K-2024"
});

// Response
{
  success: true,
  wallet: "5KKs...",
  positions: [
    {
      market_ticker: "BTC-100K-2024",
      market_title: "BTC above $100K by end of 2024?",
      side: "yes",
      quantity: 15.5,
      market_status: "active"
    }
  ],
  summary: {
    total_positions: 1,
    active_positions: 1,
    resolved_positions: 0
  }
}
```

### redeemPosition

Redeem winning outcome tokens after market resolution.

```typescript
// Redeem all tokens in position
const result = await redeemPosition({
  market_ticker: "BTC-100K-2024",
  side: "yes"
});

// Or redeem specific quantity
const result = await redeemPosition({
  market_ticker: "BTC-100K-2024",
  side: "yes",
  quantity: 10
});

// Response
{
  success: true,
  market_ticker: "BTC-100K-2024",
  side: "yes",
  is_redeemable: true,
  payout_pct: 1.0,
  redeemed_quantity: 15.5,
  payout_amount: 15.5,
  signature: "9LMn..."
}
```

### Market Resolution Helper

The `resolveMints` utility resolves market tickers to mint addresses:

```typescript
import { resolveMints, getTradeMintsForBuy, getTradeMintsForSell } from "@/lib/ai/tools";

// Resolve market ticker
const resolved = await resolveMints("BTC-100K-2024");
// {
//   market_ticker: "BTC-100K-2024",
//   event_ticker: "BTC-2024",
//   title: "BTC above $100K by end of 2024?",
//   settlement_mint: "EPjF...",  // USDC
//   yes_mint: "YES...",
//   no_mint: "NO...",
//   market_ledger: "LED...",
//   status: "active"
// }

// Get mints for buying YES
const buyMints = getTradeMintsForBuy(resolved, "yes");
// { inputMint: "EPjF..." (USDC), outputMint: "YES..." }

// Get mints for selling NO
const sellMints = getTradeMintsForSell(resolved, "no");
// { inputMint: "NO...", outputMint: "EPjF..." (USDC) }
```

### Tool Factory

Create tools with wallet and signer injection:

```typescript
import { createAgentTools } from "@/lib/ai/tools";
import { createSignerFromBase58PrivateKey } from "@/lib/solana/signer";

// Create signer from private key
const signer = await createSignerFromBase58PrivateKey(privateKey);

// Create tools bound to wallet (async function)
const tools = await createAgentTools(walletAddress, signer);

// Discover markets
const events = await tools.discoverEvent.execute({ category: "crypto" });

// Use tools
const positions = await tools.retrievePosition.execute({});
const trade = await tools.increasePosition.execute({
  market_ticker: "BTC-100K-2024",
  side: "yes",
  usdc_amount: 10
});
```

## Available Tools Summary

| Tool | Durable | Purpose |
|------|---------|---------|
| `discoverEvent` | Yes | Discover events with nested markets (event-centric discovery) |
| `getBalance` | Yes | Check wallet balance |
| `getTradeHistory` | Yes | Recent trade history |
| `increasePosition` | Yes | Buy YES/NO outcome tokens |
| `decreasePosition` | Yes | Sell YES/NO outcome tokens |
| `retrievePosition` | Yes | Get current positions |
| `redeemPosition` | Yes | Redeem winning positions |

## Unified API Endpoint

### `/api/chat`

Single endpoint handles all chat-related operations:

| Method | Query Params | Purpose |
|--------|--------------|---------|
| `POST` | - | Trigger trading workflow (from signal) |
| `GET` | `runId` | Resume workflow stream |
| `GET` | `runId` + `startIndex` | Resume from specific position |
| `GET` | `sessionId` | Fetch historical messages |

### Request Examples

```typescript
// POST - Start trading workflow
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    modelId: 'openrouter/gpt-4o',
    walletAddress: '...',
    priceSwings: [...],
    signal: { type: 'price_swing', ... }
  })
});
// Response headers include x-workflow-run-id for resumability

// GET - Resume stream
const stream = await fetch(`/api/chat?runId=${runId}`);

// GET - Fetch history
const messages = await fetch(`/api/chat?sessionId=${sessionId}`);
```

## Frontend Integration

### WorkflowChatTransport

Use AI-SDK's `useChat` with `WorkflowChatTransport` for resumable streams:

```typescript
import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";

function TradingFeed() {
  const transport = new WorkflowChatTransport({
    api: "/api/chat",
    onChatSendMessage: (response) => {
      const runId = response.headers.get("x-workflow-run-id");
      // Store for resumption
    },
    prepareReconnectToStreamRequest: ({ chatId }) => ({
      url: `/api/chat?runId=${chatId}`,
    }),
  });

  const { messages } = useChat({ transport });
  return <ModelChatFeed messages={messages} />;
}
```

### Supabase Realtime

Subscribe to `agent_decisions` for real-time updates:

```typescript
// hooks/chat/useRealtimeMessages.ts
export function useRealtimeMessages({ sessionId, onMessage }) {
  useEffect(() => {
    const channel = supabase
      .channel(`decisions:${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "agent_decisions",
      }, async (payload) => {
        const message = await fetchAndTransformDecision(payload.new.id);
        onMessage(message);
      })
      .subscribe();

    return () => channel.unsubscribe();
  }, [sessionId, onMessage]);
}
```

## Prompts

Prompts are organized by agent type in the `prompts/` directory:

```typescript
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/trading/systemPrompt";
import { buildContextPrompt } from "@/lib/ai/prompts/trading/contextBuilder";
import { ARENA_ASSISTANT_PROMPT } from "@/lib/ai/prompts/chat/assistantPrompt";
```

### Trading Prompt Guidelines
1. **Research First** - Check market details and portfolio before trading
2. **High Conviction Only** - Only trade with >70% confidence
3. **Risk Management** - Max 20% of portfolio per position
4. **Explain Reasoning** - Document analysis and decisions

## Guardrails

Two-layer risk control system:

### 1. Pre-Trade Validation (`guardrails/riskLimits.ts`)

```typescript
import { validateTrade } from "@/lib/ai/guardrails";

const result = validateTrade(tradeSize, marketId, portfolio);
// Returns: { approved: boolean, reason?: string, adjustedSize?: number }
```

**Risk Limits:**
- `maxSinglePosition`: 20% of portfolio per position
- `maxTotalExposure`: 80% total exposure
- `maxDailyLoss`: 5% daily loss limit
- `maxTradeSize`: $100 per trade
- `minConfidence`: 70% minimum

### 2. LLM-Level Limits (`guardrails/middleware.ts`)

```typescript
import { createTradingMiddleware } from "@/lib/ai/guardrails";

const middleware = createTradingMiddleware({
  maxTokens: 4096,
  maxToolCalls: 20,
  maxTradesPerRun: 3,
  modelId: "openrouter/gpt-4o",
});
```

## Models

Models are defined in `catalog.ts` with arena-specific configuration:

```typescript
{
  id: "openrouter/gpt-4o",
  name: "GPT-4o",
  provider: "openrouter",
  contextLength: 128000,
  // Arena config
  chartColor: "#10b981",
  walletAddress: process.env.WALLET_GPT4O_PUBLIC,
  enabled: true,
}
```

### Available Models
- GPT-4o, GPT-4o Mini (OpenAI)
- Claude Sonnet 4, Claude 3.5 Haiku (Anthropic)
- Gemini 2.0 Flash (Google)
- DeepSeek Chat
- Llama 3.3 70B (Meta)
- Mistral Large

### Model Functions

```typescript
import {
  getArenaModels,      // Get enabled arena models
  getModelsWithWallets, // Get models with wallet configured
  getWalletPrivateKey,  // Get private key for signing
  getModel,             // Get AI SDK model instance
} from "@/lib/ai/models";
```

## Environment Variables

```bash
# OpenRouter API (for AI models)
OPENROUTER_API_KEY=...

# dflow API (for prediction markets)
DFLOW_API_KEY=...

# Model wallet public keys
WALLET_GPT4O_PUBLIC=<solana-public-key>
WALLET_CLAUDE_SONNET_PUBLIC=<solana-public-key>
# ... per model

# Model wallet private keys (for signing)
WALLET_GPT4O_PRIVATE=<solana-private-key>
WALLET_CLAUDE_SONNET_PRIVATE=<solana-private-key>
# ... per model

# Security secrets
ADMIN_SECRET=your-admin-secret
CRON_SECRET=your-cron-secret
WEBHOOK_SECRET=your-webhook-secret

# PartyKit (for frontend live signals)
NEXT_PUBLIC_PARTYKIT_HOST=your-project.partykit.dev
```

## Key Dependencies

```json
{
  "dependencies": {
    "workflow": "^4.x",
    "@workflow/ai": "^4.x",
    "ai": "^6.x",
    "zod": "^4.x",
    "@solana/kit": "^2.x"
  }
}
```

## Data Flow

```
Signal (PartyKit) → POST /api/chat → tradingAgentWorkflow
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              DurableAgent.stream()  recordAgentDecision()  Supabase Realtime
                    │                     │                     │
                    ▼                     ▼                     ▼
              UIMessageChunk         agent_decisions      useRealtimeMessages
              (live stream)          (persistence)        (chat feed update)
```

## Migration Notes

### Deleted Files
- `lib/ai/agents/chatAgent.ts` - Replaced by DurableAgent workflow
- `lib/ai/agents/predictionMarketAgent.ts` - Merged into tradingAgent.ts
- `lib/ai/tools/trade-execution/` - Replaced by new position management tools
- `lib/ai/tools/market-discovery/` - Replaced by discoverEvent tool
- `app/api/chat/stream/route.ts` - Merged into /api/chat GET handler
- `app/api/arena/chat-messages/route.ts` - Merged into /api/chat?sessionId=

### New Files
- `lib/ai/tools/discoverEvent.ts` - Event-centric market discovery (replaces market-discovery tools)
- `lib/ai/tools/increasePosition.ts` - Buy YES/NO tokens (replaces placeOrder buy)
- `lib/ai/tools/decreasePosition.ts` - Sell YES/NO tokens (replaces placeOrder sell)
- `lib/ai/tools/retrievePosition.ts` - Get positions (dflow-based)
- `lib/ai/tools/redeemPosition.ts` - Redeem winning positions
- `lib/ai/tools/utils/resolveMints.ts` - Market ticker resolution helper

### Updated Files
- `lib/ai/tools/index.ts` - Now exports discoverEvent and position management tools
- `lib/ai/workflows/tradingAgent.ts` - Now uses DurableAgent with durable tools
- `app/api/chat/route.ts` - Unified POST/GET handlers
- `hooks/chat/useChat.ts` - Uses WorkflowChatTransport
- `lib/ai/agents/index.ts` - Types only (implementations in workflows)
