# dflow Integration

Client library for interacting with dflow prediction market APIs.

## Architecture

```
lib/dflow/
└── client.ts          # Shared API client with authentication

app/api/dflow/         # API routes that proxy to dflow
├── markets/           # Market discovery endpoints
├── order/             # Trade execution endpoints
├── positions/         # Position queries
├── trades/            # Trade history
└── live-data/         # Real-time price data
```

## API Client

The dflow client provides authenticated access to two APIs:

```typescript
import { dflowMetadataFetch, dflowQuoteFetch } from "@/lib/dflow/client";

// Metadata API - markets, live-data, outcome-mints, trades
const response = await dflowMetadataFetch("/markets?status=active");

// Quote API - order placement, order status
const response = await dflowQuoteFetch("/order", {
  method: "POST",
  body: JSON.stringify(orderData),
});
```

## Base URLs

| API | URL | Purpose |
|-----|-----|---------|
| Metadata API | `https://prediction-markets-api.dflow.net/api/v1` | Markets, prices, trades |
| Quote API | `https://quote-api.dflow.net` | Order placement and status |
| WebSocket | `wss://prediction-markets-api.dflow.net/api/v1/ws` | Real-time prices |

## API Endpoints

### Market Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dflow/markets` | GET | List prediction markets with filtering |
| `/api/dflow/markets/[ticker]` | GET | Get detailed market information |
| `/api/dflow/markets/batch` | POST | Get multiple markets by tickers/mints |
| `/api/dflow/markets/filter-outcome-mints` | POST | Filter addresses to outcome mints |
| `/api/dflow/live-data` | GET | Get live data by milestoneIds |

### Trading Execution

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dflow/order` | POST | Place a new order |
| `/api/dflow/order/[id]` | GET | Check order status |
| `/api/dflow/order/[id]` | DELETE | Cancel a pending order |

### Portfolio Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dflow/positions` | GET | Get wallet positions (3-step flow) |
| `/api/dflow/trades` | GET | Get trade history |
| `/api/solana/balance` | GET | Get wallet balance (SOL/USDC/CASH) |

## Order Placement

Orders support both sync and async execution modes:

```typescript
// Place order via API
const response = await fetch("/api/dflow/order", {
  method: "POST",
  body: JSON.stringify({
    wallet: "...",
    wallet_private_key: "...",
    market_ticker: "BTCD-25DEC0313-T92749.99",
    side: "yes",          // "yes" | "no"
    action: "buy",        // "buy" | "sell"
    quantity: 10,
    limit_price: 0.65,    // 0-1 range
    slippage_tolerance: 0.02,
    execution_mode: "sync",
  }),
});
```

## Position Fetching (3-Step Flow)

Positions are fetched using a multi-step process:

1. **RPC Query** - Get all token accounts for wallet
2. **Filter Outcome Mints** - Call `/markets/filter-outcome-mints` to identify prediction market tokens
3. **Batch Market Lookup** - Call `/markets/batch` to get market details for positions

This is handled internally by the `/api/dflow/positions` endpoint.

## Price Service

Real-time price updates via WebSocket:

```typescript
import { priceService } from "@/lib/arena/services/priceService";

await priceService.connect();
const price = priceService.getPrice("BTCD-25DEC0313-T92749.99");
const allPrices = priceService.getAllPrices();
priceService.disconnect();
```

## Environment Variables

```bash
# dflow API authentication
DFLOW_API_KEY=...

# Solana RPC (for balance/position queries)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Documentation Links

- [Swap API - Order](https://pond.dflow.net/swap-api-reference/order/order)
- [Metadata API - Markets](https://pond.dflow.net/prediction-market-metadata-api-reference/markets/markets)
- [WebSocket - Prices](https://pond.dflow.net/prediction-market-metadata-api-reference/websockets/prices)
