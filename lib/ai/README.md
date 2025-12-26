# AI Module

Autonomous trading agents and LLM infrastructure for Alpha Arena prediction market competition.

## Architecture

```
lib/ai/
├── agents/                    # Trading and chat agents
│   ├── predictionMarketAgent.ts   # Autonomous trading agent
│   ├── chatAgent.ts               # Arena assistant for user questions
│   └── index.ts                   # Agent exports
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
└── workflows/                 # Durable workflows
    ├── index.ts                   # Workflow exports
    ├── priceWatcher.ts            # Long-lived price polling workflow
    ├── tradingAgent.ts            # Per-model trading execution
    └── dailyReview.ts             # Daily P&L analysis
```

## Agents

### PredictionMarketAgent

Autonomous trading agent using AI SDK's agentic loop pattern. Each model gets its own agent instance with wallet context.

```typescript
import { PredictionMarketAgent } from "@/lib/ai/agents";

const agent = new PredictionMarketAgent({
  modelId: "openrouter/gpt-4o",
  modelIdentifier: "openrouter/gpt-4o",
  walletAddress: "...",
  walletPrivateKey: "...",
  sessionId: "...",
});

const result = await agent.executeTradingLoop(context, priceSwings);
// Returns: { reasoning, trades, steps }
```

**Agentic Loop Features:**
- Uses `generateText` with `stopWhen: stepCountIs(5)` for multi-step reasoning
- Tools bound to wallet context for each agent instance
- Extracts trades from `placeOrder` tool call results
- Saves reasoning and trades to chat messages

### Chat Agent

Arena assistant for answering user questions about trading activity.

```typescript
import { chatAgent } from "@/lib/ai/agents";

// Uses gpt-4o-mini for fast, cheap responses
// Read-only assistant with no trading tools
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

## Tools

Tools are created via factory function with wallet context injection:

```typescript
import { createAgentTools } from "@/lib/ai/tools";

const tools = createAgentTools(walletAddress, walletPrivateKey);
// Returns wallet-bound tools for market discovery, portfolio, and trading
```

### Market Discovery (Read-only)
| Tool | Description |
|------|-------------|
| `getMarkets` | List prediction markets with filtering |
| `getMarketDetails` | Get detailed market information |
| `getLiveData` | Get live prices and orderbook |

### Portfolio Management (Wallet-bound)
| Tool | Description |
|------|-------------|
| `getBalance` | Check wallet balance (USDC) |
| `getPositions` | Get current open positions |
| `getTradeHistory` | Review past trades |

### Trade Execution (Wallet-bound with signing)
| Tool | Description |
|------|-------------|
| `placeOrder` | Execute buy/sell orders |
| `getOrderStatus` | Check order fill status |
| `cancelOrder` | Cancel pending orders |

## Workflows

Durable workflows using the `workflow` package for reliable, observable execution:

### Price Watcher Workflow

Long-lived workflow that polls for price updates and triggers agents on significant swings.

```typescript
import { priceWatcherWorkflow } from "@/lib/ai/workflows";

// Runs indefinitely with durable sleep between polls
// Detects 5% price swings and triggers trading workflows
```

### Trading Agent Workflow

Per-model trading execution with streaming support.

```typescript
import { tradingAgentWorkflow } from "@/lib/ai/workflows";

// Executes a single trading agent run
// Streams reasoning to frontend in real-time
```

### Daily Review Workflow

Analyzes daily trading performance and extracts insights.

```typescript
import { dailyReviewWorkflow } from "@/lib/ai/workflows";

// Triggered at end of each trading day
// Generates lessons learned and calibration scores
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

# Admin/Cron secrets
ADMIN_SECRET=your-admin-secret
CRON_SECRET=your-cron-secret
```

## API Endpoints

### Workflow Management
- `POST /api/workflows/start` - Start price watcher workflow
- `GET /api/workflows/start` - Check workflow status

### Cron (Health Check + Fallback)
- `GET /api/cron/trading` - Checks workflow health, falls back to direct execution

### Streaming
- `GET /api/chat/stream?runId=xxx` - Resumable stream for agent reasoning
