# Implementation Plan: Market Flip Triggers for Agent Positions

## Overview

Enhance both `polymarket-relay.ts` and `dflow-relay.ts` to trigger agents when markets they hold flip sides (price crosses 50% threshold). Both relays currently have issues:

- **polymarket-relay**: Only subscribes to frontend-watched markets, missing agent-held markets
- **dflow-relay**: Subscribes to ALL markets globally (`all: true`), which is wasteful

**Goal**: Both relays should subscribe to exactly:
```
Subscribed Markets = Frontend Markets ∪ Agent Position Markets
```

**Single trigger**: Market price flips (crosses 50% with hysteresis)
**Who gets triggered**: Only agents holding positions in that market (via `filterByPosition: true`)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              polymarket-relay.ts / dflow-relay.ts                │
│              (same pattern for both)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Subscribed Markets:                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │ Frontend Markets    │  │ Agent Position      │               │
│  │ (user is viewing)   │  │ Markets             │               │
│  └─────────────────────┘  └─────────────────────┘               │
│            │                        │                            │
│            │              ┌─────────┴─────────┐                 │
│            │              │                   │                 │
│            │        On Startup          Real-time Push          │
│            │        (API call)          (HTTP handler)          │
│            │              │                   ↑                 │
│            └──────────────┼───────────────────┼─────────────────│
│                           ▼                   │                 │
│              ┌─────────────────────┐          │                 │
│              │  Price Updates      │          │                 │
│              │  (selective sub)    │          │                 │
│              └──────────┬──────────┘          │                 │
│                         │                     │                 │
│         ┌───────────────┼───────────────┐     │                 │
│         ▼                               ▼     │                 │
│  ┌─────────────────┐           ┌─────────────────┐              │
│  │ Broadcast to    │           │ Check for Flip  │              │
│  │ Frontend        │           │ (0.48/0.52)     │              │
│  └─────────────────┘           └────────┬────────┘              │
│                                         │                        │
│                                         ▼                        │
│                          ┌──────────────────────────┐           │
│                          │ POST /api/agents/trigger │           │
│                          │ filterByPosition: true   │           │
│                          └──────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                                    ↑
                                    │
┌───────────────────────────────────┼─────────────────────────────┐
│                   tradingAgentWorkflow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Agent executes trade                                            │
│         ↓                                                        │
│  recordResultsStep (Supabase)                                    │
│         ↓                                                        │
│  notifyRelaysStep ─────────────────────────────────────────────→│
│  (POST to correct relay based on exchange)                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Platform Detection

Platforms are inferred from ticker format (no database changes needed):

| Platform | Ticker Format | Example |
|----------|---------------|---------|
| Polymarket | Long numeric string (50+ digits) | `21742633143463906290569050155826241533067272736897614950488156847949938836455` |
| dflow | Human-readable with dashes | `TRUMP-WIN-2024`, `BTCD-25DEC0313-T92749.99` |

```typescript
function inferPlatform(ticker: string): "polymarket" | "dflow" {
  // Polymarket tickers are very long numeric strings
  if (/^\d{50,}$/.test(ticker)) {
    return "polymarket";
  }
  return "dflow";
}
```

---

## Files to Modify

```
lib/supabase/agents.ts
└── Add getAllAgentMarkets(sessionId, platform?) function

app/api/agents/markets/route.ts (NEW)
└── GET endpoint with ?platform= filter

party/polymarket-relay.ts
├── Add agent market tracking (agentMarkets Set)
├── Add HTTP handler (onRequest) for real-time notifications
├── Add startup refresh (refreshAgentMarkets)
├── Add periodic refresh (backup)
└── Update subscription logic

party/dflow-relay.ts
├── Remove `all: true` subscriptions
├── Remove trades/orderbook channels (only prices needed)
├── Remove volume_spike/orderbook_imbalance detection
├── Add client subscription tracking (like polymarket)
├── Add agent market tracking (agentMarkets Set)
├── Add HTTP handler (onRequest) for real-time notifications
├── Add onMessage handler for frontend subscribe/unsubscribe
├── Add startup refresh
└── Add periodic refresh (backup)

lib/ai/workflows/tradingAgent.ts
└── Add notifyRelaysStep (notifies correct relay based on exchange)
```

---

## 1. Database Function: Get All Agent Markets

Add to `lib/supabase/agents.ts`:

```typescript
/**
 * Get all unique market tickers that any agent holds a position in.
 * Optionally filter by platform (inferred from ticker format).
 *
 * @param sessionId - Current trading session ID
 * @param platform - Optional: "polymarket" or "dflow" to filter
 * @returns Array of unique market tickers
 */
export async function getAllAgentMarkets(
  sessionId: string,
  platform?: "polymarket" | "dflow"
): Promise<string[]> {
  const client = createServerClient();
  if (!client) return [];

  // Get all agent sessions for this trading session
  const { data: sessions, error: sessionsError } = await client
    .from("agent_sessions")
    .select("id")
    .eq("session_id", sessionId);

  if (sessionsError || !sessions || sessions.length === 0) {
    console.error("[agents] Failed to fetch agent sessions:", sessionsError);
    return [];
  }

  const sessionIds = sessions.map((s) => s.id);

  // Get all positions with quantity > 0
  const { data: positions, error: positionsError } = await client
    .from("agent_positions")
    .select("market_ticker")
    .in("agent_session_id", sessionIds)
    .gt("quantity", 0);

  if (positionsError || !positions) {
    console.error("[agents] Failed to fetch agent positions:", positionsError);
    return [];
  }

  // Get unique tickers
  let uniqueTickers = [...new Set(positions.map((p) => p.market_ticker))];

  // Filter by platform if specified
  if (platform) {
    uniqueTickers = uniqueTickers.filter((ticker) => {
      const isPolymarket = /^\d{50,}$/.test(ticker);
      return platform === "polymarket" ? isPolymarket : !isPolymarket;
    });
  }

  return uniqueTickers;
}
```

---

## 2. API Endpoint: Get Agent Markets

Create `app/api/agents/markets/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getGlobalSession } from "@/lib/supabase/db";
import { getAllAgentMarkets } from "@/lib/supabase/agents";

/**
 * GET /api/agents/markets
 *
 * Returns market tickers that agents hold positions in.
 *
 * Query params:
 *   - platform: "polymarket" | "dflow" (optional, returns all if not specified)
 *
 * Authentication: Requires WEBHOOK_SECRET in Authorization header.
 */
export async function GET(req: NextRequest) {
  // Verify webhook secret
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const session = await getGlobalSession();

    // Get platform filter from query params
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") as
      | "polymarket"
      | "dflow"
      | null;

    const markets = await getAllAgentMarkets(
      session.id,
      platform || undefined
    );

    return NextResponse.json({
      markets,
      count: markets.length,
      platform: platform || "all",
    });
  } catch (error) {
    console.error("[agents/markets] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## 3. Update polymarket-relay.ts

### Add Agent Market Tracking Properties

```typescript
// Add to class properties
private agentMarkets = new Set<string>();
private agentMarketRefreshTimer: ReturnType<typeof setInterval> | null = null;
private readonly AGENT_MARKET_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min backup
```

### Update onStart

```typescript
async onStart() {
  console.log("[polymarket-relay] Starting relay server");
  await this.refreshAgentMarkets();  // Fetch agent markets on startup
  this.connectToPolymarket();
}
```

### Add refreshAgentMarkets Method

```typescript
/**
 * Fetch all Polymarket markets any agent holds and subscribe to them.
 */
private async refreshAgentMarkets() {
  const vercelUrl = this.room.env.VERCEL_URL as string | undefined;
  const webhookSecret = this.room.env.WEBHOOK_SECRET as string | undefined;

  if (!vercelUrl || !webhookSecret) {
    console.warn("[polymarket-relay] Missing VERCEL_URL or WEBHOOK_SECRET");
    return;
  }

  try {
    const response = await fetch(
      `${vercelUrl}/api/agents/markets?platform=polymarket`,
      {
        headers: { Authorization: `Bearer ${webhookSecret}` },
      }
    );

    if (!response.ok) {
      console.error(
        `[polymarket-relay] Failed to fetch agent markets: ${response.status}`
      );
      return;
    }

    const { markets } = (await response.json()) as { markets: string[] };

    // Find new markets to subscribe to
    const newMarkets = markets.filter((m) => !this.agentMarkets.has(m));

    // Update tracked set
    this.agentMarkets = new Set(markets);

    // Subscribe to new markets if connected
    if (newMarkets.length > 0 && this.polymarketWs?.readyState === WebSocket.OPEN) {
      this.sendSubscription(newMarkets);
      console.log(
        `[polymarket-relay] Subscribed to ${newMarkets.length} agent-held markets`
      );
    }

    console.log(
      `[polymarket-relay] Tracking ${markets.length} agent-held markets`
    );
  } catch (error) {
    console.error("[polymarket-relay] Error refreshing agent markets:", error);
  }
}
```

### Add HTTP Handler (onRequest)

```typescript
/**
 * Handle HTTP requests for real-time market subscription updates.
 */
async onRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("authorization");
  const webhookSecret = this.room.env.WEBHOOK_SECRET as string | undefined;

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      type: string;
      markets?: string[];
    };

    if (body.type === "subscribe_markets" && Array.isArray(body.markets)) {
      const newMarkets = body.markets.filter((m) => !this.agentMarkets.has(m));

      if (newMarkets.length > 0) {
        for (const market of newMarkets) {
          this.agentMarkets.add(market);
        }

        if (this.polymarketWs?.readyState === WebSocket.OPEN) {
          this.sendSubscription(newMarkets);
          console.log(
            `[polymarket-relay] Real-time subscribed to ${newMarkets.length} new markets`
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, subscribed: newMarkets.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Invalid request type", { status: 400 });
  } catch (error) {
    console.error("[polymarket-relay] HTTP handler error:", error);
    return new Response("Internal error", { status: 500 });
  }
}
```

### Update WS Open Handler

```typescript
ws.addEventListener("open", () => {
  console.log("[polymarket-relay] Connected to Polymarket");
  this.initialSubscriptionSent = false;

  // Re-subscribe to client markets
  if (this.subscribedAssets.size > 0) {
    this.sendSubscription(Array.from(this.subscribedAssets));
  }

  // Subscribe to agent markets
  if (this.agentMarkets.size > 0) {
    this.sendSubscription(Array.from(this.agentMarkets));
  }

  // Start periodic refresh as backup
  this.startAgentMarketRefreshInterval();
});
```

### Add Periodic Refresh

```typescript
private startAgentMarketRefreshInterval() {
  if (this.agentMarketRefreshTimer) {
    clearInterval(this.agentMarketRefreshTimer);
  }

  this.agentMarketRefreshTimer = setInterval(() => {
    this.refreshAgentMarkets();
  }, this.AGENT_MARKET_REFRESH_INTERVAL);
}
```

### Update updateSubscriptions

```typescript
private updateSubscriptions() {
  const allAssets = new Set<string>();

  // Add client-subscribed assets
  for (const assets of this.clientSubscriptions.values()) {
    for (const asset of assets) {
      allAssets.add(asset);
    }
  }

  // Add agent-held markets
  for (const market of this.agentMarkets) {
    allAssets.add(market);
  }

  const newAssets = Array.from(allAssets).filter(
    (a) => !this.subscribedAssets.has(a)
  );

  this.subscribedAssets = allAssets;

  if (newAssets.length > 0) {
    this.sendSubscription(newAssets);
  }
}
```

---

## 4. Refactor dflow-relay.ts

### Summary of Changes

1. **Remove `all: true`** - Switch to selective `tickers: [...]` subscription
2. **Remove trades/orderbook channels** - Only subscribe to prices (for flip detection)
3. **Remove unused detection methods** - `detectVolumeSpike()`, `detectOrderbookImbalance()`
4. **Remove unused state** - `tradeVolumes` Map
5. **Add client subscription tracking** - `clientSubscriptions` Map (like polymarket)
6. **Add agent market tracking** - `agentMarkets` Set
7. **Add `onMessage()` handler** - For frontend subscribe/unsubscribe
8. **Add `onRequest()` handler** - For real-time workflow notifications
9. **Add startup/periodic refresh** - Fetch agent dflow markets

### New Class Structure

```typescript
export default class DflowRelay implements PartyKitServer {
  private dflowWs: WebSocket | null = null;

  // Price tracking (for flip detection)
  private priceCache = new Map<string, number>();
  private positionStates = new Map<string, PositionState>();
  private flipCooldowns = new Map<string, number>();

  // Subscription tracking (NEW - mirrors polymarket-relay)
  private subscribedTickers = new Set<string>();
  private clientSubscriptions = new Map<string, Set<string>>(); // connId -> tickers
  private agentMarkets = new Set<string>();
  private agentMarketRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly AGENT_MARKET_REFRESH_INTERVAL = 5 * 60 * 1000;

  constructor(readonly room: Room) {}

  // ... methods below
}
```

### Update onStart

```typescript
async onStart() {
  console.log("[dflow-relay] Starting relay server");
  await this.refreshAgentMarkets();
  this.connectToDflow();
}
```

### Update connectToDflow - Selective Subscription

```typescript
private async connectToDflow() {
  // ... existing connection setup with x-api-key header ...

  ws.accept();
  this.dflowWs = ws as unknown as WebSocket;

  console.log("[dflow-relay] Connected to dflow");

  // Subscribe to current markets (if any)
  this.subscribeToCurrentMarkets();

  // Start periodic refresh
  this.startAgentMarketRefreshInterval();

  // ... event handlers ...
}

private subscribeToCurrentMarkets() {
  const allTickers = new Set<string>();

  for (const tickers of this.clientSubscriptions.values()) {
    for (const ticker of tickers) {
      allTickers.add(ticker);
    }
  }
  for (const ticker of this.agentMarkets) {
    allTickers.add(ticker);
  }

  if (allTickers.size > 0 && this.dflowWs?.readyState === WebSocket.OPEN) {
    this.sendSubscription(Array.from(allTickers));
  }

  this.subscribedTickers = allTickers;
}
```

### Add sendSubscription Method

```typescript
private sendSubscription(tickers: string[]) {
  if (!this.dflowWs || this.dflowWs.readyState !== WebSocket.OPEN) {
    return;
  }

  if (tickers.length === 0) {
    return;
  }

  // dflow uses "tickers" array for selective subscription
  this.dflowWs.send(
    JSON.stringify({
      type: "subscribe",
      channel: "prices",
      tickers: tickers,
    })
  );

  console.log(`[dflow-relay] Subscribed to ${tickers.length} markets`);
}
```

### Add refreshAgentMarkets

```typescript
private async refreshAgentMarkets() {
  const vercelUrl = this.room.env.VERCEL_URL as string | undefined;
  const webhookSecret = this.room.env.WEBHOOK_SECRET as string | undefined;

  if (!vercelUrl || !webhookSecret) {
    console.warn("[dflow-relay] Missing VERCEL_URL or WEBHOOK_SECRET");
    return;
  }

  try {
    const response = await fetch(
      `${vercelUrl}/api/agents/markets?platform=dflow`,
      {
        headers: { Authorization: `Bearer ${webhookSecret}` },
      }
    );

    if (!response.ok) {
      console.error(
        `[dflow-relay] Failed to fetch agent markets: ${response.status}`
      );
      return;
    }

    const { markets } = (await response.json()) as { markets: string[] };

    const newMarkets = markets.filter((m) => !this.agentMarkets.has(m));

    this.agentMarkets = new Set(markets);

    if (newMarkets.length > 0 && this.dflowWs?.readyState === WebSocket.OPEN) {
      this.sendSubscription(newMarkets);
      console.log(
        `[dflow-relay] Subscribed to ${newMarkets.length} agent-held markets`
      );
    }

    console.log(`[dflow-relay] Tracking ${markets.length} agent-held markets`);
  } catch (error) {
    console.error("[dflow-relay] Error refreshing agent markets:", error);
  }
}
```

### Add onMessage Handler (for frontend)

```typescript
onMessage(
  message: string | ArrayBuffer | ArrayBufferView,
  sender: Connection
) {
  try {
    const messageStr =
      typeof message === "string"
        ? message
        : new TextDecoder().decode(message);
    const msg = JSON.parse(messageStr) as {
      type: "subscribe" | "unsubscribe";
      tickers: string[];
    };

    if (msg.type === "subscribe" && Array.isArray(msg.tickers)) {
      const clientTickers =
        this.clientSubscriptions.get(sender.id) || new Set();
      for (const ticker of msg.tickers) {
        clientTickers.add(ticker);
      }
      this.clientSubscriptions.set(sender.id, clientTickers);
      this.updateSubscriptions();
      console.log(
        `[dflow-relay] Client ${sender.id} subscribed to ${msg.tickers.length} markets`
      );
    }

    if (msg.type === "unsubscribe" && Array.isArray(msg.tickers)) {
      const clientTickers = this.clientSubscriptions.get(sender.id);
      if (clientTickers) {
        for (const ticker of msg.tickers) {
          clientTickers.delete(ticker);
        }
        this.updateSubscriptions();
      }
    }
  } catch (error) {
    console.error("[dflow-relay] Failed to parse client message:", error);
  }
}
```

### Add onRequest Handler (for workflow)

```typescript
async onRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("authorization");
  const webhookSecret = this.room.env.WEBHOOK_SECRET as string | undefined;

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      type: string;
      markets?: string[];
    };

    if (body.type === "subscribe_markets" && Array.isArray(body.markets)) {
      const newMarkets = body.markets.filter((m) => !this.agentMarkets.has(m));

      if (newMarkets.length > 0) {
        for (const market of newMarkets) {
          this.agentMarkets.add(market);
        }

        if (this.dflowWs?.readyState === WebSocket.OPEN) {
          this.sendSubscription(newMarkets);
          console.log(
            `[dflow-relay] Real-time subscribed to ${newMarkets.length} new markets`
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, subscribed: newMarkets.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Invalid request type", { status: 400 });
  } catch (error) {
    console.error("[dflow-relay] HTTP handler error:", error);
    return new Response("Internal error", { status: 500 });
  }
}
```

### Add updateSubscriptions

```typescript
private updateSubscriptions() {
  const allTickers = new Set<string>();

  for (const tickers of this.clientSubscriptions.values()) {
    for (const ticker of tickers) {
      allTickers.add(ticker);
    }
  }

  for (const ticker of this.agentMarkets) {
    allTickers.add(ticker);
  }

  const newTickers = Array.from(allTickers).filter(
    (t) => !this.subscribedTickers.has(t)
  );

  this.subscribedTickers = allTickers;

  if (newTickers.length > 0) {
    this.sendSubscription(newTickers);
  }
}
```

### Update onConnect/onClose

```typescript
onConnect(conn: Connection) {
  console.log(`[dflow-relay] Client connected: ${conn.id}`);
  this.clientSubscriptions.set(conn.id, new Set());
}

onClose(conn: Connection) {
  console.log(`[dflow-relay] Client disconnected: ${conn.id}`);
  this.clientSubscriptions.delete(conn.id);
  this.updateSubscriptions();
}
```

### Simplified handleDflowMessage

```typescript
private handleDflowMessage(msg: PriceMessage) {
  // Only handle price messages now
  if (msg.channel !== "prices") return;

  // Check for position flip
  const flipSignal = this.detectPositionFlip(msg);
  if (flipSignal) {
    this.triggerAgentsWithFlip(flipSignal);
  }

  // Broadcast to connected frontend clients
  this.room.broadcast(JSON.stringify(msg));
}
```

### Remove These Methods/State

```typescript
// DELETE these:
// - private tradeVolumes = new Map<string, number[]>();
// - private detectVolumeSpike(msg: TradeMessage): Signal | null
// - private detectOrderbookImbalance(msg: OrderbookMessage): Signal | null
// - private triggerAgents(signal: Signal) // keep only triggerAgentsWithFlip
```

---

## 5. Update Trading Workflow

Update `lib/ai/workflows/tradingAgent.ts`:

### Add notifyRelaysStep Function

```typescript
/**
 * Notify the appropriate relay of new market subscriptions.
 * Routes to polymarket-relay or dflow-relay based on exchange.
 */
async function notifyRelaysStep(trades: TradingResult["trades"]): Promise<void> {
  "use step";

  const partyKitHost = process.env.PARTYKIT_HOST;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!partyKitHost || !webhookSecret) {
    console.warn(
      "[tradingAgent] Missing PARTYKIT_HOST or WEBHOOK_SECRET, skipping relay notification"
    );
    return;
  }

  // Group trades by exchange
  const polymarketMarkets = [
    ...new Set(
      trades.filter((t) => t.exchange === "polymarket").map((t) => t.marketTicker)
    ),
  ];

  const dflowMarkets = [
    ...new Set(
      trades.filter((t) => t.exchange === "dflow").map((t) => t.marketTicker)
    ),
  ];

  // Notify polymarket-relay
  if (polymarketMarkets.length > 0) {
    try {
      const response = await fetch(
        `${partyKitHost}/parties/polymarket-relay/main`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({
            type: "subscribe_markets",
            markets: polymarketMarkets,
          }),
        }
      );

      if (response.ok) {
        const result = (await response.json()) as { subscribed: number };
        if (result.subscribed > 0) {
          console.log(
            `[tradingAgent] Notified polymarket-relay of ${result.subscribed} new markets`
          );
        }
      }
    } catch (error) {
      console.error("[tradingAgent] Error notifying polymarket-relay:", error);
    }
  }

  // Notify dflow-relay
  if (dflowMarkets.length > 0) {
    try {
      const response = await fetch(
        `${partyKitHost}/parties/dflow-relay/main`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({
            type: "subscribe_markets",
            markets: dflowMarkets,
          }),
        }
      );

      if (response.ok) {
        const result = (await response.json()) as { subscribed: number };
        if (result.subscribed > 0) {
          console.log(
            `[tradingAgent] Notified dflow-relay of ${result.subscribed} new markets`
          );
        }
      }
    } catch (error) {
      console.error("[tradingAgent] Error notifying dflow-relay:", error);
    }
  }
}
```

### Update Main Workflow

```typescript
export async function tradingAgentWorkflow(
  input: TradingInput
): Promise<TradingResult> {
  console.log(`[tradingAgent:${input.modelId}] Starting trading workflow`);

  try {
    const session = await getSessionStep();

    const agentSession = await getAgentSessionStep(
      session.id,
      input.modelId,
      input.walletAddress
    );

    const result = await runAgentStep(input);

    await recordResultsStep(agentSession, result);

    // Notify relays of new positions (NEW)
    if (result.trades.length > 0) {
      await notifyRelaysStep(result.trades);
    }

    await updateAllBalancesStep(session);

    await checkAndRebalanceStep(input.modelId);

    console.log(
      `[tradingAgent:${input.modelId}] Completed: ${result.decision}, ${result.trades.length} trades`
    );

    return result;
  } catch (error) {
    console.error(`[tradingAgent:${input.modelId}] Error:`, error);
    throw error;
  }
}
```

---

## 6. Environment Variables

Add to `.env`:

```bash
# PartyKit host for relay notifications
PARTYKIT_HOST=https://your-project.your-username.partykit.dev
```

Already exist:
```bash
WEBHOOK_SECRET=...
VERCEL_URL=...
DFLOW_API_KEY=...
```

---

## Implementation Checklist

### Phase 1: Shared Infrastructure
- [ ] Add `getAllAgentMarkets(sessionId, platform?)` to `lib/supabase/agents.ts`
- [ ] Create `app/api/agents/markets/route.ts` with `?platform=` filter
- [ ] Test endpoint returns correct markets for each platform

### Phase 2: polymarket-relay Updates
- [ ] Add `agentMarkets` Set and refresh timer
- [ ] Add `refreshAgentMarkets()` method (calls API with `?platform=polymarket`)
- [ ] Add `onRequest()` HTTP handler
- [ ] Call `refreshAgentMarkets()` in `onStart()`
- [ ] Update `updateSubscriptions()` to include agent markets
- [ ] Re-subscribe to agent markets on WS reconnect
- [ ] Add periodic refresh timer

### Phase 3: dflow-relay Refactor
- [ ] Remove `all: true` from subscription
- [ ] Remove trades/orderbook channel subscriptions
- [ ] Remove `detectVolumeSpike()` and `detectOrderbookImbalance()`
- [ ] Remove `tradeVolumes` Map
- [ ] Add `clientSubscriptions` Map
- [ ] Add `agentMarkets` Set and refresh timer
- [ ] Add `sendSubscription(tickers)` method
- [ ] Add `refreshAgentMarkets()` method (calls API with `?platform=dflow`)
- [ ] Add `onMessage()` handler for frontend subscribe/unsubscribe
- [ ] Add `onRequest()` HTTP handler
- [ ] Add `updateSubscriptions()` method
- [ ] Update `onConnect()`/`onClose()` to manage client subscriptions

### Phase 4: Workflow Updates
- [ ] Add `notifyRelaysStep()` function (routes by exchange)
- [ ] Call after `recordResultsStep()` in main workflow
- [ ] Add `PARTYKIT_HOST` to environment

### Phase 5: Testing
- [ ] polymarket-relay subscribes to agent polymarket markets on startup
- [ ] dflow-relay subscribes to agent dflow markets on startup
- [ ] Workflow notifies correct relay based on exchange
- [ ] Flip detection triggers correct agent(s) on each platform
- [ ] Periodic refresh catches missed markets
- [ ] Relays handle reconnection correctly

---

## Configuration

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `AGENT_MARKET_REFRESH_INTERVAL` | 5 min | both relays | Backup periodic refresh |
| `FLIP_UPPER_THRESHOLD` | 0.52 | both relays | Price above = YES-favored |
| `FLIP_LOWER_THRESHOLD` | 0.48 | both relays | Price below = NO-favored |
| `FLIP_COOLDOWN_MS` | 1 hour | both relays | Prevent spam triggers |

---

## Data Flow: Agent Trades New Market

```
1. Agent decides to buy into new market
   ↓
2. placeMarketOrder executes trade (exchange = "polymarket" or "dflow")
   ↓
3. recordResultsStep writes to agent_positions
   ↓
4. notifyRelaysStep checks trade.exchange:
   - polymarket → POST to polymarket-relay
   - dflow → POST to dflow-relay
   ↓
5. Relay's onRequest() receives { type: "subscribe_markets", markets: [...] }
   ↓
6. Relay adds to agentMarkets Set
   ↓
7. Relay subscribes via WebSocket
   ↓
8. If market price later flips → agent gets triggered
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Relay notification fails | Workflow continues; periodic refresh catches up |
| Agent closes position | Market stays subscribed; `getAgentsHoldingTicker()` filters at trigger time |
| Multiple trades same workflow | Deduplicates to unique markets per exchange |
| Relay restarts | `onStart()` refetches agent markets |
| Frontend subscribes to same market | Both sources tracked; union subscription sent |
| No frontend connected | Agent markets still subscribed |

---

## Testing Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| GPT trades new Polymarket market | polymarket-relay notified, subscribes |
| Claude trades new dflow market | dflow-relay notified, subscribes |
| Polymarket price flips, GPT holds | GPT triggered |
| dflow price flips, Claude holds | Claude triggered |
| Both relays restart | Both refetch agent markets on startup |
| Agent trades on both platforms | Both relays notified appropriately |
