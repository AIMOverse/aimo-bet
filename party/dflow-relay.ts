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
      this.dflowWs!.send(
        JSON.stringify({
          type: "subscribe",
          channel: "prices",
          all: true,
        })
      );
      this.dflowWs!.send(
        JSON.stringify({
          type: "subscribe",
          channel: "trades",
          all: true,
        })
      );
      this.dflowWs!.send(
        JSON.stringify({
          type: "subscribe",
          channel: "orderbook",
          all: true,
        })
      );
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
        console.log(
          `[dflow-relay] Price swing detected: ${msg.market_ticker} ${(change * 100).toFixed(2)}%`
        );
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

    const avgVolume =
      volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);

    if (msg.count >= avgVolume * VOLUME_SPIKE_MULTIPLIER) {
      console.log(
        `[dflow-relay] Volume spike detected: ${ticker} ${msg.count} vs avg ${avgVolume.toFixed(0)}`
      );
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
      console.log(
        `[dflow-relay] Orderbook imbalance: ${msg.market_ticker} ratio ${ratio.toFixed(2)}`
      );
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
    const vercelUrl = this.room.env.VERCEL_URL as string | undefined;
    const webhookSecret = this.room.env.WEBHOOK_SECRET as string | undefined;

    if (!vercelUrl || !webhookSecret) {
      console.warn(
        "[dflow-relay] Missing VERCEL_URL or WEBHOOK_SECRET, skipping agent trigger"
      );
      return;
    }

    try {
      const response = await fetch(`${vercelUrl}/api/signals/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify(signal),
      });

      if (!response.ok) {
        console.error(
          `[dflow-relay] Failed to trigger agents: ${response.status}`
        );
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
