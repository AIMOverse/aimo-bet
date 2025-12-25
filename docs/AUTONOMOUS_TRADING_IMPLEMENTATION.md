# Autonomous LLM Trading Implementation

This document summarizes the implementation of the autonomous trading system for Alpha Arena, where LLMs compete by trading on prediction markets 24/7.

## Overview

The refactoring transforms the trading agents from a structured pipeline approach to an autonomous agentic loop using the AI SDK. Key changes include:

1. **Wallet Configuration**: Each LLM model has its own dedicated wallet
2. **Agentic Loop**: Agents use `generateText` with tools and `maxSteps` for autonomous decision-making
3. **Price Swing Detection**: Only trigger agent runs when significant price movements occur
4. **Tool Factory**: Tools are injected with wallet context for each agent instance

## Architecture

```
Vercel Cron (1 min)
       │
       ▼
┌─────────────────────────────────────────┐
│  1. Fetch current market prices         │
│  2. Detect price swings (5% threshold)  │
└─────────────────────────────────────────┘
       │
       ▼ (if swings detected)
┌─────────────────────────────────────────┐
│  For each enabled model with wallet:    │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  PredictionMarketAgent            │  │
│  │  - Tools bound to wallet context  │  │
│  │  - generateText with maxSteps: 5  │  │
│  │  - Autonomous tool calling        │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Results:                               │
│  - Executed trades                      │
│  - Chat messages saved                  │
│  - Performance tracked                  │
└─────────────────────────────────────────┘
```

## Files Modified

### Phase 1: Wallet Configuration

**`lib/ai/models/catalog.ts`**
- Added `walletAddress` field to each model definition, read from environment variables:
  - `WALLET_GPT4O_PUBLIC`
  - `WALLET_GPT4O_MINI_PUBLIC`
  - `WALLET_CLAUDE_SONNET_PUBLIC`
  - `WALLET_CLAUDE_HAIKU_PUBLIC`
  - `WALLET_GEMINI_FLASH_PUBLIC`
  - `WALLET_DEEPSEEK_PUBLIC`
  - `WALLET_LLAMA_PUBLIC`
  - `WALLET_MISTRAL_PUBLIC`
- Added `getWalletPrivateKey(modelId)` function for retrieving private keys from:
  - `WALLET_GPT4O_PRIVATE`
  - `WALLET_GPT4O_MINI_PRIVATE`
  - (etc.)

**`types/db.ts`**
- Added `walletPrivateKey?: string` to `PredictionMarketAgentConfig`

### Phase 2: Agent Refactoring

**`lib/ai/agents/predictionMarketAgent.ts`**
- Replaced abstract class with concrete `PredictionMarketAgent` class
- Implemented agentic loop using `generateText` with:
  - System prompt from `TRADING_SYSTEM_PROMPT`
  - Tools bound to wallet context
  - `maxSteps: 5` for multi-step reasoning
- Added step logging with `onStepFinish` callback
- Extracts trades from `placeOrder` tool call results
- Saves reasoning/trades to chat messages

**Key types exported:**
- `AgentExecutionResult`: Contains reasoning, trades, and steps
- `AgentStep`: Individual step with text and tool calls
- `PriceSwing`: Price movement information

### Phase 3: Trading System Prompt

**`lib/ai/agents/prompts/tradingPrompt.ts`** (new file)
- `TRADING_SYSTEM_PROMPT`: Defines agent behavior and available tools
- `buildContextPrompt()`: Builds context with markets, portfolio, and price swings

### Phase 4: Tool Factory

**`lib/ai/tools/index.ts`**
- Added `createAgentTools(walletAddress, walletPrivateKey)` factory function
- Creates wallet-bound tools:
  - **Market Discovery**: `getMarkets`, `getMarketDetails`, `getLiveData`
  - **Portfolio**: `getBalance`, `getPositions`, `getTradeHistory`
  - **Trade Execution**: `placeOrder`, `getOrderStatus`, `cancelOrder`
- Exported `AgentTools` type

### Phase 5: Price Swing Detection

**`lib/supabase/prices.ts`** (new file)
- `syncPricesAndDetectSwings()`: Main function for price sync and swing detection
- `detectPriceSwings()`: Compares current prices to stored prices
- `updateStoredPrices()`: Updates database with current prices
- `savePriceHistory()`: Saves historical data for trend analysis
- `cleanupPriceHistory()`: Removes old history (>24h)

**`lib/config.ts`**
- Added `TRADING_CONFIG`:
  - `swingThreshold: 0.05` (5% price change triggers agents)
  - `lookbackMinutes: 5`
  - `maxStepsPerAgent: 5`
  - `maxPositionPercent: 0.2` (20% max per position)
  - `minConfidence: 0.7` (70% confidence threshold)

### Phase 6: Cron Job Updates

**`app/api/cron/trading/route.ts`**
- Imports refactored `PredictionMarketAgent` and price sync functions
- Flow:
  1. Fetch current market prices
  2. Sync prices and detect swings
  3. Skip if no significant swings (cost optimization)
  4. Get enabled models with wallets
  5. Create agent for each model with wallet context
  6. Execute agentic trading loop with price swing info
  7. Return results with swing and trade counts

**`vercel.json`**
- Trading cron: `* * * * *` (every 1 minute - requires Vercel Pro)
- Snapshots cron: `*/5 * * * *` (every 5 minutes)

## Database Tables Required

```sql
-- Current price snapshot per market
CREATE TABLE market_prices (
  ticker TEXT PRIMARY KEY,
  yes_bid NUMERIC,
  yes_ask NUMERIC,
  no_bid NUMERIC,
  no_ask NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historical prices for swing detection
CREATE TABLE market_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT,
  yes_mid NUMERIC,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_history_time ON market_price_history(recorded_at DESC);
```

## Environment Variables Required

### Public Keys (for queries)
```bash
WALLET_GPT4O_PUBLIC=<solana-public-key>
WALLET_GPT4O_MINI_PUBLIC=<solana-public-key>
WALLET_CLAUDE_SONNET_PUBLIC=<solana-public-key>
WALLET_CLAUDE_HAIKU_PUBLIC=<solana-public-key>
WALLET_GEMINI_FLASH_PUBLIC=<solana-public-key>
WALLET_DEEPSEEK_PUBLIC=<solana-public-key>
WALLET_LLAMA_PUBLIC=<solana-public-key>
WALLET_MISTRAL_PUBLIC=<solana-public-key>
```

### Private Keys (for signing transactions)
```bash
WALLET_GPT4O_PRIVATE=<solana-private-key>
WALLET_GPT4O_MINI_PRIVATE=<solana-private-key>
WALLET_CLAUDE_SONNET_PRIVATE=<solana-private-key>
WALLET_CLAUDE_HAIKU_PRIVATE=<solana-private-key>
WALLET_GEMINI_FLASH_PRIVATE=<solana-private-key>
WALLET_DEEPSEEK_PRIVATE=<solana-private-key>
WALLET_LLAMA_PRIVATE=<solana-private-key>
WALLET_MISTRAL_PRIVATE=<solana-private-key>
```

## Trading Flow

1. **Cron triggers** every minute
2. **Fetch prices** from dflow API
3. **Detect swings** by comparing to stored prices (5% threshold)
4. **Skip if no swings** to save LLM costs
5. **For each model**:
   - Create `PredictionMarketAgent` with wallet context
   - Build market context (balance, positions, trades)
   - Call `executeTradingLoop(context, priceSwings)`
   - Agent autonomously:
     - Reviews market data
     - Uses tools to gather more info
     - Decides whether to trade
     - Executes trades via `placeOrder` tool
     - Explains reasoning
6. **Save results** to chat messages

## Agent Behavior

The agent follows these guidelines (from system prompt):

1. **Research First**: Check market details and portfolio before trading
2. **High Conviction Only**: Only trade when confidence > 70%
3. **Risk Management**: Never risk more than 20% of portfolio per position
4. **Explain Reasoning**: Document analysis and decision process

## Cost Optimization

- Price swing detection prevents unnecessary agent runs
- Agents only triggered on 5%+ price movements
- Reduces LLM API costs significantly
- Still maintains 1-minute responsiveness to market changes

## Deployment Notes

1. **Vercel Pro Required**: 1-minute cron interval requires Pro plan
2. **Create Database Tables**: Run the SQL above before deployment
3. **Set Environment Variables**: Add all wallet keys to Vercel project settings
4. **Fund Wallets**: Each model wallet needs USDC for trading
