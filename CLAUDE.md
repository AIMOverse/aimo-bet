# Alpha Arena

AI prediction market trading competition on dflow. LLMs autonomously trade on prediction markets 24/7.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                        │
│         / (charts)  |  /chat  |  /positions  |  /trades                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
┌───────────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  /api/sessions        │ │  /api/dflow/*   │ │  /api/chat      │
│  /api/performance     │ │  (On-chain)     │ │  (Streaming)    │
│  /api/signals/trigger │ │                 │ │                 │
└───────────────────────┘ └─────────────────┘ └─────────────────┘
          │                       │                   │
          ▼                       ▼                   ▼
┌─────────────────┐     ┌─────────────────┐   ┌─────────────────┐
│    Supabase     │     │   dflow APIs    │   │   AI Agents     │
│                 │     │  Swap/Metadata  │   │                 │
│ - sessions      │     └────────┬────────┘   │ - chatAgent     │
│ - snapshots     │              │            │ - Trading       │
│ - chat_messages │              │            │   Workflow      │
│ - market_signals│     ┌────────┴────────┐   └─────────────────┘
│                 │     │  dflow WebSocket │
│  Realtime       │     │  wss://...      │
│  - chat channel │     └────────┬────────┘
│  - signals feed │              │
└─────────────────┘              │
                                 │
                    ┌────────────┴────────────┐
                    │      PartyKit           │
                    │   (WebSocket Relay)     │
                    │   party/dflow-relay.ts  │
                    └─────────────────────────┘
```

---

## AI Module Architecture

```
lib/ai/
├── models/           # Model definitions & registry
│   ├── catalog.ts    # Model catalog with wallet addresses
│   ├── registry.ts   # AI SDK provider registry
│   ├── providers.ts  # Provider configurations
│   ├── openrouter.ts # OpenRouter provider
│   └── aimo.ts       # AIMO provider
│
├── tools/            # Agent tools (wallet-injected)
│   ├── index.ts      # createAgentTools() factory
│   ├── market-discovery/
│   ├── portfolio-management/
│   └── trade-execution/
│
├── agents/           # Agent implementations
│   ├── predictionMarketAgent.ts
│   └── chatAgent.ts
│
├── prompts/          # System prompts
│   ├── trading/
│   └── chat/
│
├── guardrails/       # Risk control & validation
│   ├── types.ts
│   ├── riskLimits.ts
│   └── middleware.ts
│
└── workflows/        # Durable workflows
    ├── priceWatcher.ts   # DEPRECATED: replaced by PartyKit relay
    └── tradingAgent.ts
```

---

## PartyKit WebSocket Relay Implementation

### Problem

Vercel serverless functions cannot maintain persistent WebSocket connections to dflow's market data stream. Functions timeout after 10-300 seconds.

### Solution

Use PartyKit as a persistent WebSocket relay that:
1. Maintains connection to dflow WebSocket (`wss://prediction-markets-api.dflow.net/api/v1/ws`)
2. Subscribes to prices, trades, and orderbook channels
3. Detects significant market signals (price swings, volume spikes, orderbook imbalances)
4. Triggers Vercel API endpoint when action is needed
5. Optionally persists data to Supabase for history/frontend

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                        PartyKit Server                                │ │
│  │                      party/dflow-relay.ts                             │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  onStart() {                                                    │ │ │
│  │  │    // Connect to dflow WebSocket                                │ │ │
│  │  │    this.ws = new WebSocket("wss://prediction-markets-api...")   │ │ │
│  │  │                                                                 │ │ │
│  │  │    // Subscribe to all channels                                 │ │ │
│  │  │    ws.send({ type: "subscribe", channel: "prices", all: true }) │ │ │
│  │  │    ws.send({ type: "subscribe", channel: "trades", all: true }) │ │ │
│  │  │    ws.send({ type: "subscribe", channel: "orderbook", all: true})│ │ │
│  │  │  }                                                              │ │ │
│  │  │                                                                 │ │ │
│  │  │  handleMessage(msg) {                                           │ │ │
│  │  │    if (msg.channel === "prices") detectPriceSwing(msg)          │ │ │
│  │  │    if (msg.channel === "trades") detectVolumeSpike(msg)         │ │ │
│  │  │    if (msg.channel === "orderbook") detectImbalance(msg)        │ │ │
│  │  │                                                                 │ │ │
│  │  │    if (significantSignal) {                                     │ │ │
│  │  │      POST → Vercel /api/signals/trigger                         │ │ │
│  │  │      INSERT → Supabase market_signals (optional)                │ │ │
│  │  │    }                                                            │ │ │
│  │  │                                                                 │ │ │
│  │  │    // Broadcast to connected frontend clients                   │ │ │
│  │  │    this.room.broadcast(msg)                                     │ │ │
│  │  │  }                                                              │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                       │
│              ┌─────────────────────┼─────────────────────┐                │
│              ▼                     ▼                     ▼                │
│  ┌─────────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │
│  │  Vercel             │  │  Supabase       │  │  Frontend           │   │
│  │  /api/signals/      │  │  market_signals │  │  (PartySocket)      │   │
│  │  trigger            │  │  table          │  │  Live signal feed   │   │
│  │       │             │  │                 │  │                     │   │
│  │       ▼             │  └─────────────────┘  └─────────────────────┘   │
│  │  tradingAgent       │                                                  │
│  │  Workflow           │                                                  │
│  └─────────────────────┘                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### dflow WebSocket Channels

| Channel | Data Format | Signal Detection |
|---------|-------------|------------------|
| **prices** | `{yes_bid, yes_ask, no_bid, no_ask}` | Price swing >5% |
| **trades** | `{price, count, taker_side, created_time}` | Volume spike, large trades |
| **orderbook** | `{yes_bids: {price→qty}, no_bids: {price→qty}}` | Depth imbalance |

### Why PartyKit?

| Requirement | Vercel | Supabase Edge | PartyKit |
|-------------|--------|---------------|----------|
| Persistent WebSocket | ❌ 300s max | ❌ 400s max | ✅ Always-on |
| Next.js integration | ✅ Native | ⚠️ Separate | ✅ Designed for it |
| Cost | Free | Free | Free tier |
| Complexity | N/A | High (restarts) | Low |

---

## Implementation Plan

### Phase 1: PartyKit Setup

#### 1.1 Install Dependencies

```bash
npm install partykit partysocket
```

#### 1.2 Create PartyKit Configuration

**File: `partykit.json`**

```json
{
  "name": "aimo-bet-relay",
  "main": "party/dflow-relay.ts",
  "compatibilityDate": "2024-01-01"
}
```

#### 1.3 Add Scripts to package.json

```json
{
  "scripts": {
    "party:dev": "partykit dev",
    "party:deploy": "partykit deploy"
  }
}
```

---

### Phase 2: PartyKit Server Implementation

#### 2.1 Create Relay Server

**File: `party/dflow-relay.ts`**

```typescript
import type { Party, PartyKitServer, Connection } from "partykit/server";

const DFLOW_WS_URL = "wss://prediction-markets-api.dflow.net/api/v1/ws";
const SWING_THRESHOLD = 0.05; // 5% price change
const VOLUME_SPIKE_MULTIPLIER = 5; // 5x average volume

interface PriceMessage {
  channel: "prices";
  type: "ticker";
  market_ticker: string;
  yes_bid: string | null;
  yes_ask: string | null;
  no_bid: string | null;
  no_ask: string | null;
}

interface TradeMessage {
  channel: "trades";
  type: "trade";
  market_ticker: string;
  trade_id: string;
  price: number;
  count: number;
  taker_side: "yes" | "no";
  created_time: number;
}

interface OrderbookMessage {
  channel: "orderbook";
  type: "orderbook";
  market_ticker: string;
  yes_bids: Record<string, number>;
  no_bids: Record<string, number>;
}

type DflowMessage = PriceMessage | TradeMessage | OrderbookMessage;

interface Signal {
  type: "price_swing" | "volume_spike" | "orderbook_imbalance";
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export default class DflowRelay implements PartyKitServer {
  private dflowWs: WebSocket | null = null;
  private priceCache = new Map<string, number>();
  private tradeVolumes = new Map<string, number[]>(); // Rolling window

  constructor(readonly room: Party) {}

  // Called when the room is created
  async onStart() {
    console.log("[dflow-relay] Starting relay server");
    this.connectToDflow();
  }

  // Connect to dflow WebSocket
  private connectToDflow() {
    console.log("[dflow-relay] Connecting to dflow WebSocket");

    this.dflowWs = new WebSocket(DFLOW_WS_URL);

    this.dflowWs.onopen = () => {
      console.log("[dflow-relay] Connected to dflow");

      // Subscribe to all channels
      this.dflowWs!.send(JSON.stringify({
        type: "subscribe",
        channel: "prices",
        all: true
      }));
      this.dflowWs!.send(JSON.stringify({
        type: "subscribe",
        channel: "trades",
        all: true
      }));
      this.dflowWs!.send(JSON.stringify({
        type: "subscribe",
        channel: "orderbook",
        all: true
      }));
    };

    this.dflowWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as DflowMessage;
        this.handleDflowMessage(msg);
      } catch (error) {
        console.error("[dflow-relay] Failed to parse message:", error);
      }
    };

    this.dflowWs.onclose = () => {
      console.log("[dflow-relay] Connection closed, reconnecting in 1s...");
      setTimeout(() => this.connectToDflow(), 1000);
    };

    this.dflowWs.onerror = (error) => {
      console.error("[dflow-relay] WebSocket error:", error);
    };
  }

  // Handle incoming dflow messages
  private async handleDflowMessage(msg: DflowMessage) {
    let signal: Signal | null = null;

    switch (msg.channel) {
      case "prices":
        signal = this.detectPriceSwing(msg);
        break;
      case "trades":
        signal = this.detectVolumeSpike(msg);
        break;
      case "orderbook":
        signal = this.detectOrderbookImbalance(msg);
        break;
    }

    // If significant signal detected, trigger agents
    if (signal) {
      await this.triggerAgents(signal);
    }

    // Broadcast to connected frontend clients
    this.room.broadcast(JSON.stringify(msg));
  }

  // Detect price swings > threshold
  private detectPriceSwing(msg: PriceMessage): Signal | null {
    const yesBid = msg.yes_bid ? parseFloat(msg.yes_bid) : null;
    const yesAsk = msg.yes_ask ? parseFloat(msg.yes_ask) : null;

    if (yesBid === null || yesAsk === null) return null;

    const mid = (yesBid + yesAsk) / 2;
    const prev = this.priceCache.get(msg.market_ticker);
    this.priceCache.set(msg.market_ticker, mid);

    if (prev && prev > 0) {
      const change = Math.abs(mid - prev) / prev;

      if (change >= SWING_THRESHOLD) {
        console.log(`[dflow-relay] Price swing detected: ${msg.market_ticker} ${(change * 100).toFixed(2)}%`);
        return {
          type: "price_swing",
          ticker: msg.market_ticker,
          data: {
            previousPrice: prev,
            currentPrice: mid,
            changePercent: change,
          },
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  // Detect volume spikes
  private detectVolumeSpike(msg: TradeMessage): Signal | null {
    const ticker = msg.market_ticker;
    const volumes = this.tradeVolumes.get(ticker) || [];

    // Add current trade volume
    volumes.push(msg.count);

    // Keep last 100 trades for average
    if (volumes.length > 100) {
      volumes.shift();
    }
    this.tradeVolumes.set(ticker, volumes);

    // Need at least 10 trades to calculate average
    if (volumes.length < 10) return null;

    const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);

    if (msg.count >= avgVolume * VOLUME_SPIKE_MULTIPLIER) {
      console.log(`[dflow-relay] Volume spike detected: ${ticker} ${msg.count} vs avg ${avgVolume.toFixed(0)}`);
      return {
        type: "volume_spike",
        ticker: msg.market_ticker,
        data: {
          tradeId: msg.trade_id,
          volume: msg.count,
          averageVolume: avgVolume,
          multiplier: msg.count / avgVolume,
          takerSide: msg.taker_side,
        },
        timestamp: Date.now(),
      };
    }

    return null;
  }

  // Detect orderbook imbalances
  private detectOrderbookImbalance(msg: OrderbookMessage): Signal | null {
    const yesBidDepth = Object.values(msg.yes_bids).reduce((a, b) => a + b, 0);
    const noBidDepth = Object.values(msg.no_bids).reduce((a, b) => a + b, 0);

    if (yesBidDepth === 0 || noBidDepth === 0) return null;

    const ratio = yesBidDepth / noBidDepth;

    // Significant imbalance: 3:1 or 1:3
    if (ratio >= 3 || ratio <= 0.33) {
      console.log(`[dflow-relay] Orderbook imbalance: ${msg.market_ticker} ratio ${ratio.toFixed(2)}`);
      return {
        type: "orderbook_imbalance",
        ticker: msg.market_ticker,
        data: {
          yesBidDepth,
          noBidDepth,
          ratio,
          direction: ratio >= 3 ? "yes_heavy" : "no_heavy",
        },
        timestamp: Date.now(),
      };
    }

    return null;
  }

  // Trigger trading agents via Vercel API
  private async triggerAgents(signal: Signal) {
    try {
      const response = await fetch(
        `${this.room.env.VERCEL_URL}/api/signals/trigger`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.room.env.WEBHOOK_SECRET}`,
          },
          body: JSON.stringify(signal),
        }
      );

      if (!response.ok) {
        console.error(`[dflow-relay] Failed to trigger agents: ${response.status}`);
      }
    } catch (error) {
      console.error("[dflow-relay] Error triggering agents:", error);
    }
  }

  // Handle frontend client connections (optional)
  onConnect(conn: Connection) {
    console.log(`[dflow-relay] Client connected: ${conn.id}`);
  }

  onClose(conn: Connection) {
    console.log(`[dflow-relay] Client disconnected: ${conn.id}`);
  }
}
```

---

### Phase 3: Vercel API Endpoint

#### 3.1 Create Signal Trigger Endpoint

**File: `app/api/signals/trigger/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getModelsWithWallets } from "@/lib/ai/models/catalog";
// import { tradingAgentWorkflow } from "@/lib/ai/workflows/tradingAgent";

interface Signal {
  type: "price_swing" | "volume_spike" | "orderbook_imbalance";
  ticker: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const signal = (await req.json()) as Signal;

    console.log(`[signals/trigger] Received signal: ${signal.type} for ${signal.ticker}`);

    // Get all models with wallets
    const models = getModelsWithWallets();

    // Trigger trading workflow for each model
    // TODO: Uncomment when workflow is ready
    // await Promise.all(
    //   models.map((model) =>
    //     tradingAgentWorkflow({
    //       modelId: model.id,
    //       walletAddress: model.walletAddress!,
    //       signal,
    //     })
    //   )
    // );

    return NextResponse.json({
      success: true,
      signal: signal.type,
      ticker: signal.ticker,
      modelsTriggered: models.length,
    });
  } catch (error) {
    console.error("[signals/trigger] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

### Phase 4: Frontend Integration (Optional)

#### 4.1 Create PartySocket Hook

**File: `hooks/useMarketSignals.ts`**

```typescript
"use client";

import { useEffect, useState } from "react";
import PartySocket from "partysocket";

interface MarketSignal {
  channel: "prices" | "trades" | "orderbook";
  market_ticker: string;
  [key: string]: unknown;
}

export function useMarketSignals() {
  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = new PartySocket({
      host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
      room: "dflow-relay",
    });

    socket.onopen = () => {
      console.log("[market-signals] Connected to PartyKit");
      setConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as MarketSignal;
        setSignals((prev) => [...prev.slice(-99), msg]); // Keep last 100
      } catch (error) {
        console.error("[market-signals] Failed to parse:", error);
      }
    };

    socket.onclose = () => {
      console.log("[market-signals] Disconnected");
      setConnected(false);
    };

    return () => {
      socket.close();
    };
  }, []);

  return { signals, connected };
}
```

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# PartyKit
NEXT_PUBLIC_PARTYKIT_HOST=your-project.partykit.dev

# API Keys
OPENROUTER_API_KEY=sk-or-...
AIMO_API_KEY=...

# Security
WEBHOOK_SECRET=your-webhook-secret
CRON_SECRET=your-cron-secret

# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Vercel (set automatically, or manually for PartyKit)
VERCEL_URL=https://your-app.vercel.app
```

---

## Deployment

### Development

```bash
# Terminal 1: Next.js
npm run dev

# Terminal 2: PartyKit
npm run party:dev
```

### Production

```bash
# Deploy PartyKit
npm run party:deploy

# Deploy to Vercel (automatic via git push)
git push
```

---

## Implementation Checklist

### Phase 1: PartyKit Setup
- [ ] Install `partykit` and `partysocket` packages
- [ ] Create `partykit.json` configuration
- [ ] Add npm scripts for dev and deploy

### Phase 2: Relay Server
- [ ] Create `party/dflow-relay.ts`
- [ ] Implement dflow WebSocket connection
- [ ] Implement price swing detection
- [ ] Implement volume spike detection
- [ ] Implement orderbook imbalance detection
- [ ] Implement agent trigger via Vercel API

### Phase 3: Vercel Integration
- [ ] Create `/api/signals/trigger` endpoint
- [ ] Add webhook secret verification
- [ ] Connect to trading agent workflow
- [ ] Add `WEBHOOK_SECRET` to environment variables

### Phase 4: Frontend (Optional)
- [ ] Create `useMarketSignals` hook
- [ ] Add live signal feed component
- [ ] Add `NEXT_PUBLIC_PARTYKIT_HOST` to environment variables

### Phase 5: Deployment
- [ ] Deploy PartyKit: `npm run party:deploy`
- [ ] Configure PartyKit environment variables (VERCEL_URL, WEBHOOK_SECRET)
- [ ] Test end-to-end: dflow → PartyKit → Vercel → Agent

### Phase 6: Cleanup
- [ ] Deprecate/remove `lib/ai/workflows/priceWatcher.ts`
- [ ] Update documentation

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `partykit.json` | PartyKit configuration |
| `party/dflow-relay.ts` | WebSocket relay server |
| `app/api/signals/trigger/route.ts` | Vercel endpoint for agent triggers |
| `hooks/useMarketSignals.ts` | Frontend live signal hook (optional) |

### Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add partykit dependencies and scripts |
| `.env` | Add WEBHOOK_SECRET, PARTYKIT_HOST |

### Files to Deprecate

| File | Reason |
|------|--------|
| `lib/ai/workflows/priceWatcher.ts` | Replaced by PartyKit relay |

---

## Signal Types Reference

### Price Swing

```typescript
{
  type: "price_swing",
  ticker: "BTCD-25DEC0313-T92749.99",
  data: {
    previousPrice: 0.45,
    currentPrice: 0.52,
    changePercent: 0.156
  },
  timestamp: 1703520000000
}
```

### Volume Spike

```typescript
{
  type: "volume_spike",
  ticker: "BTCD-25DEC0313-T92749.99",
  data: {
    tradeId: "abc123",
    volume: 500,
    averageVolume: 50,
    multiplier: 10,
    takerSide: "yes"
  },
  timestamp: 1703520000000
}
```

### Orderbook Imbalance

```typescript
{
  type: "orderbook_imbalance",
  ticker: "BTCD-25DEC0313-T92749.99",
  data: {
    yesBidDepth: 15000,
    noBidDepth: 3000,
    ratio: 5,
    direction: "yes_heavy"
  },
  timestamp: 1703520000000
}
```
