# dflow Prediction Market Trading Tools - Implementation Summary

This document summarizes the implementation of LLM agent tools for autonomous trading on dflow prediction markets.

## Overview

The implementation follows the architecture defined in `CLAUDE.md`, providing a complete set of tools for:
- **Market Discovery** - Finding and analyzing trading opportunities
- **Trading Execution** - Placing, monitoring, and canceling orders
- **Portfolio Management** - Tracking positions, balances, and trade history

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        LLM Agent                                │
│                  (lib/ai/agents/...)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Tools                                │
│                  (lib/ai/tools/markets/...)                     │
│   getMarkets, getMarketDetails, placeOrder, getPositions, etc.  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Next.js API Routes                            │
│                    (app/api/dflow/...)                          │
│         Internal endpoints that proxy to dflow APIs             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      dflow APIs                                 │
│            Swap API  |  Metadata API  |  WebSocket              │
└─────────────────────────────────────────────────────────────────┘
```

## API Routes

### Market Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dflow/markets` | GET | List prediction markets with filtering |
| `/api/dflow/markets/[ticker]` | GET | Get detailed market information |
| `/api/dflow/prices` | GET | Get live bid/ask prices |

### Trading Execution

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dflow/order` | POST | Place a new order |
| `/api/dflow/order/[id]` | GET | Check order status |
| `/api/dflow/order/[id]` | DELETE | Cancel a pending order |

### Portfolio Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dflow/positions` | GET | Get wallet token positions |
| `/api/dflow/balance` | GET | Get wallet balance (USDC/CASH) |
| `/api/dflow/trades` | GET | Get trade history |

## Agent Tools

All tools are exported from `lib/ai/tools/markets/` and available via `lib/ai/tools/index.ts`.

### Market Discovery Tools

#### `getMarketsTool`
Discover prediction markets with optional filtering.

```typescript
// Parameters
{
  status?: "active" | "inactive" | "closed" | "determined" | "finalized",
  series?: string,      // Filter by series ticker
  category?: string,    // Filter by category (crypto, sports, etc.)
  limit?: number        // Max markets to return (default: 20)
}
```

#### `getMarketDetailsTool`
Get detailed information about a specific market.

```typescript
// Parameters
{
  ticker: string  // Market ticker (e.g., "BTCD-25DEC0313-T92749.99")
}
```

#### `getMarketPricesTool`
Get real-time bid/ask prices for markets.

```typescript
// Parameters
{
  tickers?: string[]  // Market tickers (empty = all markets)
}
```

### Trading Execution Tools

#### `placeOrderTool`
Place an order to buy or sell outcome tokens.

```typescript
// Parameters
{
  market_ticker: string,
  side: "yes" | "no",
  action: "buy" | "sell",
  quantity: number,
  limit_price?: number,           // 0-1 range
  slippage_tolerance?: number,    // Default: 0.02 (2%)
  execution_mode?: "sync" | "async"
}
```

#### `getOrderStatusTool`
Check the status of an async order.

```typescript
// Parameters
{
  order_id: string
}
```

#### `cancelOrderTool`
Cancel a pending async order.

```typescript
// Parameters
{
  order_id: string
}
```

### Portfolio Management Tools

#### `getPositionsTool`
Get current positions (outcome token holdings).

```typescript
// Parameters
{
  wallet: string,
  market_tickers?: string[],
  include_closed?: boolean  // Default: false
}
```

#### `getBalanceTool`
Get available cash balance for trading.

```typescript
// Parameters
{
  wallet: string,
  currency?: "USDC" | "CASH"  // Default: "USDC"
}
```

#### `getTradeHistoryTool`
Get history of past trades.

```typescript
// Parameters
{
  wallet?: string,
  market_ticker?: string,
  limit?: number  // Default: 50
}
```

## Price Service

A WebSocket-based real-time price cache is available at `lib/arena/services/priceService.ts`.

```typescript
import { priceService } from "@/lib/arena/services/priceService";

// Connect to WebSocket
await priceService.connect();

// Get price for a specific market
const price = priceService.getPrice("BTCD-25DEC0313-T92749.99");

// Get all prices
const allPrices = priceService.getAllPrices();

// Check connection status
const isConnected = priceService.isConnected();

// Disconnect
priceService.disconnect();
```

## Agent Integration

Tools are available for AI SDK tool-calling via the `dflowTools` export:

```typescript
import { dflowTools } from "@/lib/ai/agents/predictionMarketAgent";
import { generateText } from "ai";

// Use tools with AI SDK
const result = await generateText({
  model: yourModel,
  prompt: "Find active crypto prediction markets",
  tools: dflowTools,
  maxSteps: 5,
});
```

Or import individual tools:

```typescript
import {
  getMarketsTool,
  placeOrderTool,
  getPositionsTool,
} from "@/lib/ai/tools";
```

## dflow API Reference

### Base URLs

| API | URL |
|-----|-----|
| Swap API | `https://swap-api.dflow.net` |
| Metadata API | `https://prediction-markets-api.dflow.net/api/v1` |
| WebSocket | `wss://prediction-markets-api.dflow.net/api/v1/ws` |

### Documentation Links

- [Swap API - Order](https://pond.dflow.net/swap-api-reference/order/order)
- [Metadata API - Markets](https://pond.dflow.net/prediction-market-metadata-api-reference/markets/markets)
- [WebSocket - Prices](https://pond.dflow.net/prediction-market-metadata-api-reference/websockets/prices)

See `CLAUDE.md` for the complete API documentation reference.

## File Structure

```
app/api/dflow/
├── markets/
│   ├── route.ts              # GET: list markets
│   └── [ticker]/
│       └── route.ts          # GET: market details
├── prices/
│   └── route.ts              # GET: live prices
├── order/
│   ├── route.ts              # POST: place order
│   └── [id]/
│       └── route.ts          # GET: status, DELETE: cancel
├── positions/
│   └── route.ts              # GET: wallet positions
├── balance/
│   └── route.ts              # GET: wallet balance
└── trades/
    └── route.ts              # GET: trade history

lib/ai/tools/markets/
├── index.ts                  # Export all tools
├── getMarkets.ts
├── getMarketDetails.ts
├── getMarketPrices.ts
├── placeOrder.ts
├── getOrderStatus.ts
├── cancelOrder.ts
├── getPositions.ts
├── getBalance.ts
└── getTradeHistory.ts

lib/arena/services/
└── priceService.ts           # WebSocket price cache
```

## Design Principles

1. **Agent Autonomy** - Tools are permissive; agents manage their own risk logic
2. **Minimal Validation** - Only reject malformed requests (negative quantities, invalid tickers)
3. **No Hardcoded Limits** - Position sizes and confidence thresholds are set by agents
4. **Execution Flexibility** - Support both sync/async modes via parameter
5. **Real-time Data** - WebSocket for prices, REST for everything else
