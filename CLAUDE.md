# Prediction Market Agent - dflow Trading Tools

## Overview

Implementation plan for LLM agent tools to autonomously trade on dflow prediction markets. Tools are organized into three categories matching the trading lifecycle.

---

## dflow API Documentation

**IMPORTANT:** When implementing tools and API route handlers, reference these official docs:

### Swap API (Trading)
| Endpoint | Documentation |
|----------|---------------|
| Order | https://pond.dflow.net/swap-api-reference/order/order |
| Order Status | https://pond.dflow.net/swap-api-reference/order/order-status |
| Quote (Imperative) | https://pond.dflow.net/swap-api-reference/imperative/quote |
| Swap (Imperative) | https://pond.dflow.net/swap-api-reference/imperative/swap |
| Swap Instructions | https://pond.dflow.net/swap-api-reference/imperative/swap-instructions |
| Quote (Declarative) | https://pond.dflow.net/swap-api-reference/declarative/quote |
| Submit (Declarative) | https://pond.dflow.net/swap-api-reference/declarative/submit |
| Prediction Market Init | https://pond.dflow.net/swap-api-reference/prediction-market/prediction-market-init |
| Tokens | https://pond.dflow.net/swap-api-reference/token/tokens |
| Tokens with Decimals | https://pond.dflow.net/swap-api-reference/token/tokens-with-decimals |
| Venues | https://pond.dflow.net/swap-api-reference/venues/venues |

### Prediction Market Metadata API
| Endpoint | Documentation |
|----------|---------------|
| Event | https://pond.dflow.net/prediction-market-metadata-api-reference/events/event |
| Events | https://pond.dflow.net/prediction-market-metadata-api-reference/events/events |
| Forecast Percentile History | https://pond.dflow.net/prediction-market-metadata-api-reference/events/forecast-percentile-history |
| Forecast Percentile History by Mint | https://pond.dflow.net/prediction-market-metadata-api-reference/events/forecast-percentile-history-by-mint |
| Event Candlesticks | https://pond.dflow.net/prediction-market-metadata-api-reference/events/event-candlesticks |
| Market | https://pond.dflow.net/prediction-market-metadata-api-reference/markets/market |
| Market by Mint | https://pond.dflow.net/prediction-market-metadata-api-reference/markets/market-by-mint |
| Markets | https://pond.dflow.net/prediction-market-metadata-api-reference/markets/markets |
| Markets Batch | https://pond.dflow.net/prediction-market-metadata-api-reference/markets/markets-batch |
| Outcome Mints | https://pond.dflow.net/prediction-market-metadata-api-reference/markets/outcome-mints |
| Filter Outcome Mints | https://pond.dflow.net/prediction-market-metadata-api-reference/markets/filter-outcome-mints |
| Market Candlesticks | https://pond.dflow.net/prediction-market-metadata-api-reference/markets/market-candlesticks |
| Market Candlesticks by Mint | https://pond.dflow.net/prediction-market-metadata-api-reference/markets/market-candlesticks-by-mint |
| Orderbook by Ticker | https://pond.dflow.net/prediction-market-metadata-api-reference/orderbook/orderbook-by-ticker |
| Orderbook by Mint | https://pond.dflow.net/prediction-market-metadata-api-reference/orderbook/orderbook-by-mint |
| Trades | https://pond.dflow.net/prediction-market-metadata-api-reference/trades/trades |
| Trades by Mint | https://pond.dflow.net/prediction-market-metadata-api-reference/trades/trades-by-mint |
| Live Data | https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data |
| Live Data by Event | https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data-by-event |
| Live Data by Mint | https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data-by-mint |
| Series | https://pond.dflow.net/prediction-market-metadata-api-reference/series/series |
| Series by Ticker | https://pond.dflow.net/prediction-market-metadata-api-reference/series/series-by-ticker |
| Tags by Categories | https://pond.dflow.net/prediction-market-metadata-api-reference/tags/tags-by-categories |
| Filters by Sports | https://pond.dflow.net/prediction-market-metadata-api-reference/sports/filters-by-sports |
| Search | https://pond.dflow.net/prediction-market-metadata-api-reference/search/search |

### WebSocket APIs
| Channel | Documentation |
|---------|---------------|
| Prices | https://pond.dflow.net/prediction-market-metadata-api-reference/websockets/prices |
| Trades | https://pond.dflow.net/prediction-market-metadata-api-reference/websockets/trades |
| Orderbook | https://pond.dflow.net/prediction-market-metadata-api-reference/websockets/orderbook |

---

## API Base URLs

**Swap API:** `https://swap-api.dflow.net`
**Metadata API:** `https://prediction-markets-api.dflow.net/api/v1`
**WebSocket:** `wss://prediction-markets-api.dflow.net/api/v1/ws`

---

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

---

## File Structure

```
lib/ai/tools/
├── index.ts                    # Export all tools
├── generateImage.ts            # Existing
├── generateVideo.ts            # Existing
├── webSearch.ts                # Existing (placeholder)
└── markets/
    ├── index.ts                # Export market tools
    ├── getMarkets.ts           # → /api/dflow/markets
    ├── getMarketDetails.ts     # → /api/dflow/markets/[ticker]
    ├── getMarketPrices.ts      # → WebSocket or /api/dflow/prices
    ├── placeOrder.ts           # → /api/dflow/order
    ├── getOrderStatus.ts       # → /api/dflow/order/[id]
    ├── cancelOrder.ts          # → /api/dflow/order/[id]
    ├── getPositions.ts         # → /api/dflow/positions
    ├── getBalance.ts           # → /api/dflow/balance
    └── getTradeHistory.ts      # → /api/dflow/trades

app/api/dflow/
├── markets/
│   ├── route.ts                # GET: list markets (→ Metadata API /markets)
│   └── [ticker]/
│       └── route.ts            # GET: market details (→ Metadata API /market)
├── events/
│   ├── route.ts                # GET: list events (→ Metadata API /events)
│   └── [ticker]/
│       └── route.ts            # GET: event details (→ Metadata API /event)
├── order/
│   ├── route.ts                # POST: place order (→ Swap API /order)
│   └── [id]/
│       └── route.ts            # GET: status, DELETE: cancel (→ Swap API /order-status)
├── quote/
│   └── route.ts                # POST: get quote (→ Swap API /quote)
├── positions/
│   └── route.ts                # GET: wallet positions (on-chain query)
├── balance/
│   └── route.ts                # GET: wallet balance (on-chain query)
├── trades/
│   └── route.ts                # GET: trade history (→ Metadata API /trades)
├── prices/
│   └── route.ts                # GET: current prices (→ Metadata API /live-data)
├── orderbook/
│   └── [ticker]/
│       └── route.ts            # GET: orderbook (→ Metadata API /orderbook-by-ticker)
└── search/
    └── route.ts                # GET: search markets (→ Metadata API /search)

lib/arena/services/
└── priceService.ts             # WebSocket price cache
```

---

## Tool Categories

### Category 1: Market Discovery

| Tool | API Route | dflow Endpoint | Docs |
|------|-----------|----------------|------|
| `getMarkets` | `/api/dflow/markets` | Metadata: `/markets` | [markets](https://pond.dflow.net/prediction-market-metadata-api-reference/markets/markets) |
| `getMarketDetails` | `/api/dflow/markets/[ticker]` | Metadata: `/market` | [market](https://pond.dflow.net/prediction-market-metadata-api-reference/markets/market) |
| `getMarketPrices` | WebSocket / `/api/dflow/prices` | Metadata: `/live-data` | [live-data](https://pond.dflow.net/prediction-market-metadata-api-reference/live-data/live-data), [ws/prices](https://pond.dflow.net/prediction-market-metadata-api-reference/websockets/prices) |

### Category 2: Trading Execution

| Tool | API Route | dflow Endpoint | Docs |
|------|-----------|----------------|------|
| `placeOrder` | `/api/dflow/order` | Swap: `/order` | [order](https://pond.dflow.net/swap-api-reference/order/order) |
| `getOrderStatus` | `/api/dflow/order/[id]` | Swap: `/order-status` | [order-status](https://pond.dflow.net/swap-api-reference/order/order-status) |
| `cancelOrder` | `/api/dflow/order/[id]` | Swap: `/order` | [order](https://pond.dflow.net/swap-api-reference/order/order) |

### Category 3: Portfolio Management

| Tool | API Route | dflow Endpoint | Docs |
|------|-----------|----------------|------|
| `getPositions` | `/api/dflow/positions` | On-chain + Metadata | [outcome-mints](https://pond.dflow.net/prediction-market-metadata-api-reference/markets/outcome-mints) |
| `getBalance` | `/api/dflow/balance` | On-chain (Solana RPC) | - |
| `getTradeHistory` | `/api/dflow/trades` | Metadata: `/trades` | [trades](https://pond.dflow.net/prediction-market-metadata-api-reference/trades/trades) |

---

## Tool Specifications

### Category 1: Market Discovery

#### getMarkets

```typescript
// lib/ai/tools/markets/getMarkets.ts
import { tool } from "ai";
import { z } from "zod";

export const getMarketsTool = tool({
  description: "Get list of prediction markets. Use to discover trading opportunities.",
  parameters: z.object({
    status: z.enum(["active", "inactive", "closed", "determined", "finalized"])
      .optional()
      .describe("Filter by market status. Default: active"),
    series: z.string().optional()
      .describe("Filter by series ticker"),
    category: z.string().optional()
      .describe("Filter by category (e.g., 'crypto', 'sports')"),
    limit: z.number().optional().default(20)
      .describe("Max markets to return"),
  }),
  execute: async ({ status = "active", series, category, limit }) => {
    const res = await fetch(`/api/dflow/markets?${new URLSearchParams({
      status,
      ...(series && { series }),
      ...(category && { category }),
      limit: String(limit),
    })}`);
    return res.json();
  },
});
```

#### getMarketDetails

```typescript
// lib/ai/tools/markets/getMarketDetails.ts
export const getMarketDetailsTool = tool({
  description: "Get detailed information about a specific market including current prices and liquidity.",
  parameters: z.object({
    ticker: z.string().describe("Market ticker (e.g., 'BTCD-25DEC0313-T92749.99')"),
  }),
  execute: async ({ ticker }) => {
    const res = await fetch(`/api/dflow/markets/${encodeURIComponent(ticker)}`);
    return res.json();
  },
});
```

#### getMarketPrices

```typescript
// lib/ai/tools/markets/getMarketPrices.ts
export const getMarketPricesTool = tool({
  description: "Get current bid/ask prices for one or more markets. Uses real-time data.",
  parameters: z.object({
    tickers: z.array(z.string()).optional()
      .describe("Market tickers to get prices for. If empty, returns all available."),
  }),
  execute: async ({ tickers }) => {
    // Read from WebSocket price cache (preferred for real-time)
    // Fallback to REST: /api/dflow/prices
    const res = await fetch(`/api/dflow/prices${tickers?.length ? `?tickers=${tickers.join(',')}` : ''}`);
    return res.json();
  },
});
```

---

### Category 2: Trading Execution

#### placeOrder

```typescript
// lib/ai/tools/markets/placeOrder.ts
export const placeOrderTool = tool({
  description: "Place an order to buy or sell outcome tokens. Supports both increasing (buying) and reducing (selling) positions.",
  parameters: z.object({
    market_ticker: z.string()
      .describe("Market to trade"),
    side: z.enum(["yes", "no"])
      .describe("Which outcome to trade"),
    action: z.enum(["buy", "sell"])
      .describe("Buy to increase position, sell to reduce"),
    quantity: z.number().positive()
      .describe("Number of outcome tokens"),
    limit_price: z.number().min(0).max(1).optional()
      .describe("Max price for buy, min for sell. Range 0-1."),
    slippage_tolerance: z.number().min(0).max(1).optional().default(0.02)
      .describe("Acceptable slippage (e.g., 0.02 = 2%)"),
    execution_mode: z.enum(["sync", "async"]).optional().default("sync")
      .describe("Sync returns immediately. Async returns order ID for polling."),
  }),
  execute: async (params) => {
    const res = await fetch('/api/dflow/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  },
});
```

#### getOrderStatus

```typescript
// lib/ai/tools/markets/getOrderStatus.ts
export const getOrderStatusTool = tool({
  description: "Check the status of an async order.",
  parameters: z.object({
    order_id: z.string().describe("Order ID from placeOrder response"),
  }),
  execute: async ({ order_id }) => {
    const res = await fetch(`/api/dflow/order/${order_id}`);
    return res.json();
  },
});
```

#### cancelOrder

```typescript
// lib/ai/tools/markets/cancelOrder.ts
export const cancelOrderTool = tool({
  description: "Cancel a pending async order.",
  parameters: z.object({
    order_id: z.string().describe("Order ID to cancel"),
  }),
  execute: async ({ order_id }) => {
    const res = await fetch(`/api/dflow/order/${order_id}`, { method: 'DELETE' });
    return res.json();
  },
});
```

---

### Category 3: Portfolio Management

#### getPositions

```typescript
// lib/ai/tools/markets/getPositions.ts
export const getPositionsTool = tool({
  description: "Get current positions (outcome token holdings) across all markets.",
  parameters: z.object({
    market_tickers: z.array(z.string()).optional()
      .describe("Filter to specific markets"),
    include_closed: z.boolean().optional().default(false)
      .describe("Include positions in closed/determined markets"),
  }),
  execute: async ({ market_tickers, include_closed }) => {
    const params = new URLSearchParams();
    if (market_tickers?.length) params.set('tickers', market_tickers.join(','));
    if (include_closed) params.set('include_closed', 'true');
    const res = await fetch(`/api/dflow/positions?${params}`);
    return res.json();
  },
});
```

#### getBalance

```typescript
// lib/ai/tools/markets/getBalance.ts
export const getBalanceTool = tool({
  description: "Get available cash balance for trading.",
  parameters: z.object({
    currency: z.enum(["USDC", "CASH"]).optional().default("USDC")
      .describe("Settlement currency to check"),
  }),
  execute: async ({ currency }) => {
    const res = await fetch(`/api/dflow/balance?currency=${currency}`);
    return res.json();
  },
});
```

#### getTradeHistory

```typescript
// lib/ai/tools/markets/getTradeHistory.ts
export const getTradeHistoryTool = tool({
  description: "Get history of past trades.",
  parameters: z.object({
    market_ticker: z.string().optional()
      .describe("Filter to specific market"),
    limit: z.number().optional().default(50)
      .describe("Max trades to return"),
  }),
  execute: async ({ market_ticker, limit }) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (market_ticker) params.set('ticker', market_ticker);
    const res = await fetch(`/api/dflow/trades?${params}`);
    return res.json();
  },
});
```

---

## WebSocket Price Service

```typescript
// lib/arena/services/priceService.ts
const WS_URL = "wss://prediction-markets-api.dflow.net/api/v1/ws";

class PriceService {
  private prices = new Map<string, MarketPrice>();
  private ws: WebSocket | null = null;

  async connect(): Promise<void> {
    this.ws = new WebSocket(WS_URL);
    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({
        type: "subscribe",
        channel: "prices",
        all: true
      }));
    };
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.channel === "prices" && data.type === "ticker") {
        this.prices.set(data.market_ticker, {
          market_ticker: data.market_ticker,
          yes_bid: data.yes_bid,
          yes_ask: data.yes_ask,
          no_bid: data.no_bid,
          no_ask: data.no_ask,
          timestamp: Date.now(),
        });
      }
    };
  }

  getPrice(ticker: string): MarketPrice | undefined {
    return this.prices.get(ticker);
  }

  getAllPrices(): MarketPrice[] {
    return Array.from(this.prices.values());
  }
}

export const priceService = new PriceService();
```

---

## Implementation Checklist

### Phase 1: API Routes
- [ ] Create `app/api/dflow/markets/route.ts`
- [ ] Create `app/api/dflow/markets/[ticker]/route.ts`
- [ ] Create `app/api/dflow/prices/route.ts`
- [ ] Create `app/api/dflow/order/route.ts`
- [ ] Create `app/api/dflow/order/[id]/route.ts`
- [ ] Create `app/api/dflow/positions/route.ts`
- [ ] Create `app/api/dflow/balance/route.ts`
- [ ] Create `app/api/dflow/trades/route.ts`

### Phase 2: Agent Tools
- [ ] Create `lib/ai/tools/markets/` directory
- [ ] Implement all 9 tools
- [ ] Export tools from `lib/ai/tools/index.ts`

### Phase 3: Price Service
- [ ] Create `lib/arena/services/priceService.ts`
- [ ] Integrate with `getMarketPrices` tool

### Phase 4: Agent Integration
- [ ] Update `PredictionMarketAgent` to use new tools
- [ ] Add wallet context injection
- [ ] Test end-to-end trading flow

---

## Design Principles

1. **Agent Autonomy** - Tools are permissive; agents manage their own risk logic
2. **Minimal Validation** - Only reject malformed requests (negative quantities, invalid tickers)
3. **No Hardcoded Limits** - Position sizes, confidence thresholds set by agent, not tools
4. **Execution Flexibility** - Support both sync/async via parameter, not separate tools
5. **Real-time Data** - WebSocket for prices, REST for everything else
6. **Reference Docs** - Always consult dflow API docs when implementing endpoints
