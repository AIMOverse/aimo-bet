# Implementation Plan: Position Flip Detection

## Overview

Add real-time position flip detection to market relays. When a market's price crosses the 50% threshold (YES-favored to NO-favored or vice versa), trigger agents holding positions in that market.

### Architecture

```
party/
├── dflow-relay.ts       # Add position flip detection + re-enable signal triggering
├── polymarket-relay.ts  # Add position flip detection + agent triggering
└── shared/
    └── position-tracker.ts  # Shared flip detection logic (optional)

app/api/agents/trigger/route.ts
└── Handle new "position_flip" signal type
```

---

## 1. Detection Logic

### Buffered Flip Detection (Hysteresis)

To avoid noise from prices oscillating around 50%, use a buffered threshold:

- **YES-favored**: price > 0.52
- **NO-favored**: price < 0.48
- **Neutral zone**: 0.48 <= price <= 0.52 (no flip triggers)

A flip is detected when:
- Price moves from YES-favored (>0.52) to NO-favored (<0.48)
- Price moves from NO-favored (<0.48) to YES-favored (>0.52)

```typescript
// Detection thresholds
const FLIP_UPPER_THRESHOLD = 0.52;  // Above this = YES-favored
const FLIP_LOWER_THRESHOLD = 0.48;  // Below this = NO-favored
const FLIP_COOLDOWN_MS = 60 * 60 * 1000;  // 1 hour cooldown per market

type PositionState = "yes_favored" | "no_favored" | "neutral";

function getPositionState(price: number): PositionState {
  if (price > FLIP_UPPER_THRESHOLD) return "yes_favored";
  if (price < FLIP_LOWER_THRESHOLD) return "no_favored";
  return "neutral";
}
```

---

## 2. Signal Type Definition

### New Signal Type: `position_flip`

```typescript
// Add to app/api/agents/trigger/route.ts

export interface PositionFlipSignal {
  type: "position_flip";
  ticker: string;           // Market ticker/asset_id
  platform: "dflow" | "polymarket";
  data: {
    previousPosition: "yes_favored" | "no_favored";
    newPosition: "yes_favored" | "no_favored";
    previousPrice: number;
    currentPrice: number;
    flipDirection: "yes_to_no" | "no_to_yes";
  };
  timestamp: number;
}

// Update MarketSignal union type
export type MarketSignal = 
  | { type: "price_swing"; ticker: string; data: Record<string, unknown>; timestamp: number }
  | { type: "volume_spike"; ticker: string; data: Record<string, unknown>; timestamp: number }
  | { type: "orderbook_imbalance"; ticker: string; data: Record<string, unknown>; timestamp: number }
  | PositionFlipSignal;
```

---

## 3. Relay Updates

### 3.1 dflow-relay.ts Changes

```typescript
// Add state tracking
private positionStates = new Map<string, PositionState>();
private flipCooldowns = new Map<string, number>();  // ticker -> last flip timestamp

// Add detection method
private detectPositionFlip(msg: PriceMessage): PositionFlipSignal | null {
  const yesBid = msg.yes_bid ? parseFloat(msg.yes_bid) : null;
  const yesAsk = msg.yes_ask ? parseFloat(msg.yes_ask) : null;

  if (yesBid === null || yesAsk === null) return null;

  const currentPrice = (yesBid + yesAsk) / 2;
  const currentState = getPositionState(currentPrice);
  const previousState = this.positionStates.get(msg.market_ticker);

  // Update state
  this.positionStates.set(msg.market_ticker, currentState);

  // Check for flip (ignoring neutral zone)
  if (
    previousState &&
    currentState !== "neutral" &&
    previousState !== "neutral" &&
    previousState !== currentState
  ) {
    // Check cooldown
    const lastFlip = this.flipCooldowns.get(msg.market_ticker) || 0;
    if (Date.now() - lastFlip < FLIP_COOLDOWN_MS) {
      return null;  // Still in cooldown
    }

    // Record flip time
    this.flipCooldowns.set(msg.market_ticker, Date.now());

    const previousPrice = this.priceCache.get(msg.market_ticker) || currentPrice;

    console.log(
      `[dflow-relay] Position flip detected: ${msg.market_ticker} ` +
      `${previousState} -> ${currentState} (${previousPrice.toFixed(3)} -> ${currentPrice.toFixed(3)})`
    );

    return {
      type: "position_flip",
      ticker: msg.market_ticker,
      platform: "dflow",
      data: {
        previousPosition: previousState,
        newPosition: currentState,
        previousPrice,
        currentPrice,
        flipDirection: currentState === "no_favored" ? "yes_to_no" : "no_to_yes",
      },
      timestamp: Date.now(),
    };
  }

  return null;
}

// Update handleDflowMessage to check for flips
private handleDflowMessage(msg: DflowMessage) {
  let signal: Signal | null = null;

  switch (msg.channel) {
    case "prices":
      // Check for position flip first (higher priority)
      const flipSignal = this.detectPositionFlip(msg);
      if (flipSignal) {
        this.triggerAgents(flipSignal);
      }
      // Then check for price swing
      signal = this.detectPriceSwing(msg);
      break;
    case "trades":
      signal = this.detectVolumeSpike(msg);
      break;
    case "orderbook":
      signal = this.detectOrderbookImbalance(msg);
      break;
  }

  if (signal) {
    this.triggerAgents(signal);
  }

  // Broadcast to connected frontend clients
  this.room.broadcast(JSON.stringify(msg));
}
```

### 3.2 polymarket-relay.ts Changes

```typescript
// Add imports and constants at top
const FLIP_UPPER_THRESHOLD = 0.52;
const FLIP_LOWER_THRESHOLD = 0.48;
const FLIP_COOLDOWN_MS = 60 * 60 * 1000;

type PositionState = "yes_favored" | "no_favored" | "neutral";

// Add state tracking to class
private positionStates = new Map<string, PositionState>();
private flipCooldowns = new Map<string, number>();

// Add helper function
private getPositionState(price: number): PositionState {
  if (price > FLIP_UPPER_THRESHOLD) return "yes_favored";
  if (price < FLIP_LOWER_THRESHOLD) return "no_favored";
  return "neutral";
}

// Add detection method
private detectPositionFlip(
  assetId: string,
  currentPrice: number,
  previousPrice: number | null
): PositionFlipSignal | null {
  const currentState = this.getPositionState(currentPrice);
  const previousState = this.positionStates.get(assetId);

  // Update state
  this.positionStates.set(assetId, currentState);

  // Check for flip
  if (
    previousState &&
    currentState !== "neutral" &&
    previousState !== "neutral" &&
    previousState !== currentState
  ) {
    // Check cooldown
    const lastFlip = this.flipCooldowns.get(assetId) || 0;
    if (Date.now() - lastFlip < FLIP_COOLDOWN_MS) {
      return null;
    }

    this.flipCooldowns.set(assetId, Date.now());

    console.log(
      `[polymarket-relay] Position flip: ${assetId.slice(0, 8)}... ` +
      `${previousState} -> ${currentState}`
    );

    return {
      type: "position_flip",
      ticker: assetId,
      platform: "polymarket",
      data: {
        previousPosition: previousState,
        newPosition: currentState,
        previousPrice: previousPrice || currentPrice,
        currentPrice,
        flipDirection: currentState === "no_favored" ? "yes_to_no" : "no_to_yes",
      },
      timestamp: Date.now(),
    };
  }

  return null;
}

// Add trigger method
private async triggerAgents(signal: PositionFlipSignal) {
  const vercelUrl = this.room.env.VERCEL_URL as string | undefined;
  const webhookSecret = this.room.env.WEBHOOK_SECRET as string | undefined;

  if (!vercelUrl || !webhookSecret) {
    console.warn("[polymarket-relay] Missing VERCEL_URL or WEBHOOK_SECRET");
    return;
  }

  try {
    const response = await fetch(`${vercelUrl}/api/agents/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify({
        signal,
        triggerType: "market",
        filterByPosition: true,
      }),
    });

    if (!response.ok) {
      console.error(`[polymarket-relay] Trigger failed: ${response.status}`);
    } else {
      const result = await response.json() as { spawned: number; message?: string };
      if (result.spawned > 0) {
        console.log(`[polymarket-relay] Triggered ${result.spawned} agent(s)`);
      }
    }
  } catch (error) {
    console.error("[polymarket-relay] Trigger error:", error);
  }
}

// Update broadcast method to check for flips
private broadcast(
  assetId: string,
  market: string,
  yesPrice: number,
  bestBid: string | null,
  bestAsk: string | null,
  timestamp: string,
) {
  // Check for position flip before broadcasting
  const previousPrice = /* need to track this */;
  const flipSignal = this.detectPositionFlip(assetId, yesPrice, previousPrice);
  if (flipSignal) {
    this.triggerAgents(flipSignal);
  }

  // ... rest of broadcast logic ...
}
```

---

## 4. Trigger API Updates

### Update MarketSignal type

```typescript
// app/api/agents/trigger/route.ts

export type MarketSignalType = 
  | "price_swing" 
  | "volume_spike" 
  | "orderbook_imbalance" 
  | "position_flip";

export interface MarketSignal {
  type: MarketSignalType;
  ticker: string;
  platform?: "dflow" | "polymarket";
  data: Record<string, unknown>;
  timestamp: number;
}
```

---

## 5. Implementation Checklist

- [ ] Update `party/dflow-relay.ts`
  - [ ] Add position state tracking (`positionStates` map)
  - [ ] Add flip cooldown tracking (`flipCooldowns` map)
  - [ ] Add `getPositionState()` helper
  - [ ] Add `detectPositionFlip()` method
  - [ ] Re-enable signal detection in `handleDflowMessage()`
  - [ ] Integrate flip detection into price message handling

- [ ] Update `party/polymarket-relay.ts`
  - [ ] Add position state tracking
  - [ ] Add flip cooldown tracking
  - [ ] Add `getPositionState()` helper
  - [ ] Add `detectPositionFlip()` method
  - [ ] Add `triggerAgents()` method (copy pattern from dflow-relay)
  - [ ] Add price history tracking for previous price comparison
  - [ ] Integrate flip detection into broadcast flow

- [ ] Update `app/api/agents/trigger/route.ts`
  - [ ] Add `"position_flip"` to `MarketSignalType`
  - [ ] Add `platform` field to `MarketSignal` interface
  - [ ] Log position flip signals distinctly

- [ ] Add environment variables to PartyKit
  - [ ] Ensure `VERCEL_URL` is set for polymarket-relay
  - [ ] Ensure `WEBHOOK_SECRET` is set for polymarket-relay

- [ ] Testing
  - [ ] Test flip detection with mock price data
  - [ ] Verify cooldown prevents duplicate triggers
  - [ ] Verify agents are triggered correctly via API

---

## 6. Expected Behavior

| Event | Trigger Condition | Cooldown | Action |
|-------|-------------------|----------|--------|
| YES to NO flip | Price drops from >0.52 to <0.48 | 1 hour | Trigger agents holding this market |
| NO to YES flip | Price rises from <0.48 to >0.52 | 1 hour | Trigger agents holding this market |
| Price in neutral zone | 0.48 <= price <= 0.52 | N/A | No trigger (avoids noise) |
| Flip during cooldown | Any direction | Active | No trigger until cooldown expires |

### Example Scenarios

1. **Market flips from YES to NO**
   - Price was 0.55 (YES-favored)
   - Price drops to 0.45 (NO-favored)
   - Signal sent: `{ type: "position_flip", flipDirection: "yes_to_no" }`
   - Agents holding positions in this market are triggered

2. **Price oscillates near 50%**
   - Price moves: 0.51 -> 0.49 -> 0.51
   - No triggers (stays within neutral zone 0.48-0.52)

3. **Rapid back-and-forth flips**
   - 10:00 - Price: 0.55 -> 0.45 (flip detected, agents triggered)
   - 10:30 - Price: 0.45 -> 0.55 (cooldown active, no trigger)
   - 11:05 - Price: 0.55 -> 0.45 (cooldown expired, agents triggered)

---

## 7. Future Enhancements (Optional)

- **Cross-platform deduplication**: Track flips by market ID across both Polymarket and dflow to avoid duplicate triggers for the same underlying market
- **Configurable thresholds**: Allow per-market or global threshold configuration
- **Flip velocity**: Track how quickly the flip occurred (sudden vs gradual)
- **Multi-threshold flips**: Detect crossings at other levels (25%, 75%) for additional signals
