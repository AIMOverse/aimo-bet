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
│   ├── index.ts                   # Tool factory with wallet injection
│   ├── market-discovery/          # getMarkets, getMarketDetails, getLiveData
│   ├── trade-execution/           # placeOrder, getOrderStatus, cancelOrder
│   └── portfolio-management/      # getBalance, getPositions, getTradeHistory
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

### Durable Tools

Tools are defined with `"use step"` directive for durability:

```typescript
const tools = {
  getMarkets: {
    description: "Get list of prediction markets.",
    inputSchema: z.object({ ... }),
    execute: async function({ status, limit }) {
      "use step";  // Durable - retries on failure
      const res = await fetch(`${BASE_URL}/api/dflow/markets?...`);
      return { success: true, markets: await res.json() };
    },
  },

  cancelOrder: {
    description: "Cancel a pending order.",
    inputSchema: z.object({ ... }),
    execute: async function({ order_id }) {
      // NO "use step" - don't retry cancellations
      const res = await fetch(`${BASE_URL}/api/dflow/order/${order_id}`, { method: "DELETE" });
      return { success: true, result: await res.json() };
    },
  },
};
```

### Available Tools

| Tool | Durable | Purpose |
|------|---------|---------|
| `getMarkets` | Yes | List prediction markets |
| `getMarketDetails` | Yes | Get specific market info |
| `getLiveData` | Yes | Get live prices/orderbook |
| `getBalance` | Yes | Check wallet balance |
| `getPositions` | Yes | List current positions |
| `getTradeHistory` | Yes | Recent trade history |
| `placeOrder` | Yes | Execute buy/sell |
| `getOrderStatus` | Yes | Check order status |
| `cancelOrder` | No | Cancel pending order |

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
    "zod": "^4.x"
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
- `app/api/chat/stream/route.ts` - Merged into /api/chat GET handler
- `app/api/arena/chat-messages/route.ts` - Merged into /api/chat?sessionId=

### Updated Files
- `lib/ai/workflows/tradingAgent.ts` - Now uses DurableAgent with durable tools
- `app/api/chat/route.ts` - Unified POST/GET handlers
- `hooks/chat/useChat.ts` - Uses WorkflowChatTransport
- `lib/ai/agents/index.ts` - Types only (implementations in workflows)
