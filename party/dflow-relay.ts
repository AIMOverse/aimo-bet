import type { Room, PartyKitServer, Connection } from "partykit/server";

// Cloudflare Workers WebSocket with accept() method for server-side connections
interface CFWebSocket extends WebSocket {
  accept(): void;
}

// Cloudflare Workers Response type with WebSocket upgrade support
interface CFWebSocketResponse extends Response {
  webSocket: CFWebSocket | null;
}

const DFLOW_WS_URL = "wss://prediction-markets-api.dflow.net/api/v1/ws";
const SWING_THRESHOLD = 0.1; // 10% price change
const VOLUME_SPIKE_MULTIPLIER = 10; // 10x average volume

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
  yes_price: number;
  no_price: number;
  yes_price_dollars: string;
  no_price_dollars: string;
  taker_side: "yes" | "no";
  created_time: number;
}

interface OrderbookMessage {
  channel: "orderbook";
  type: "orderbook";
  market_ticker: string;
  yes_bids: Record<string, number>;
  yes_asks: Record<string, number>;
  no_bids: Record<string, number>;
  no_asks: Record<string, number>;
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

  constructor(readonly room: Room) {}

  // Called when the room is created
  async onStart() {
    console.log("[dflow-relay] Starting relay server");
    this.connectToDflow();
  }

  // Connect to dflow WebSocket using fetch-based upgrade (allows custom headers)
  private async connectToDflow() {
    console.log("[dflow-relay] Connecting to dflow WebSocket");

    const apiKey = this.room.env.DFLOW_API_KEY as string | undefined;
    if (!apiKey) {
      console.error("[dflow-relay] Missing DFLOW_API_KEY environment variable");
      return;
    }

    try {
      // Use fetch with Upgrade header to perform WebSocket handshake with custom headers
      // This is the Cloudflare Workers way to connect to WebSockets with auth headers
      const response = await fetch(DFLOW_WS_URL.replace("wss://", "https://"), {
        headers: {
          Upgrade: "websocket",
          "x-api-key": apiKey,
        },
      });

      const ws = (response as unknown as CFWebSocketResponse).webSocket;
      if (!ws) {
        console.error(
          "[dflow-relay] Failed to establish WebSocket connection, status:",
          response.status,
        );
        setTimeout(() => this.connectToDflow(), 5000);
        return;
      }

      // Accept the WebSocket connection (required for Cloudflare Workers WebSockets)
      ws.accept();
      this.dflowWs = ws as unknown as WebSocket;

      console.log("[dflow-relay] Connected to dflow");

      // Subscribe to all channels immediately after accept()
      // (Cloudflare WebSockets are already "open" after accept())
      this.dflowWs.send(
        JSON.stringify({
          type: "subscribe",
          channel: "prices",
          all: true,
        }),
      );
      this.dflowWs.send(
        JSON.stringify({
          type: "subscribe",
          channel: "trades",
          all: true,
        }),
      );
      this.dflowWs.send(
        JSON.stringify({
          type: "subscribe",
          channel: "orderbook",
          all: true,
        }),
      );

      // Set up event handlers
      this.dflowWs.addEventListener("message", (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as DflowMessage;
          this.handleDflowMessage(msg);
        } catch (error) {
          console.error("[dflow-relay] Failed to parse message:", error);
        }
      });

      this.dflowWs.addEventListener("close", () => {
        console.log("[dflow-relay] Connection closed, reconnecting in 1s...");
        setTimeout(() => this.connectToDflow(), 1000);
      });

      this.dflowWs.addEventListener("error", (error: Event) => {
        console.error("[dflow-relay] WebSocket error:", error);
      });
    } catch (error) {
      console.error("[dflow-relay] Failed to connect:", error);
      setTimeout(() => this.connectToDflow(), 5000);
    }
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
        // DISABLED: Too noisy for position management
        // signal = this.detectOrderbookImbalance(msg);
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
          `[dflow-relay] Price swing detected: ${msg.market_ticker} ${(
            change * 100
          ).toFixed(2)}%`,
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
        `[dflow-relay] Volume spike detected: ${ticker} ${
          msg.count
        } vs avg ${avgVolume.toFixed(0)}`,
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
    // Safely handle potentially missing fields with defaults
    const yesBidDepth = Object.values(msg.yes_bids || {}).reduce(
      (a, b) => a + b,
      0,
    );
    const yesAskDepth = Object.values(msg.yes_asks || {}).reduce(
      (a, b) => a + b,
      0,
    );
    const noBidDepth = Object.values(msg.no_bids || {}).reduce(
      (a, b) => a + b,
      0,
    );
    const noAskDepth = Object.values(msg.no_asks || {}).reduce(
      (a, b) => a + b,
      0,
    );

    // Total depth on each side (YES vs NO)
    const yesTotalDepth = yesBidDepth + yesAskDepth;
    const noTotalDepth = noBidDepth + noAskDepth;

    if (yesTotalDepth === 0 || noTotalDepth === 0) return null;

    const ratio = yesTotalDepth / noTotalDepth;

    // Significant imbalance: 3:1 or 1:3
    if (ratio >= 3 || ratio <= 0.33) {
      console.log(
        `[dflow-relay] Orderbook imbalance: ${
          msg.market_ticker
        } ratio ${ratio.toFixed(2)}`,
      );
      return {
        type: "orderbook_imbalance",
        ticker: msg.market_ticker,
        data: {
          yesBidDepth,
          yesAskDepth,
          yesTotalDepth,
          noBidDepth,
          noAskDepth,
          noTotalDepth,
          ratio,
          direction: ratio >= 3 ? "yes_heavy" : "no_heavy",
        },
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Trigger agents via Vercel API with position filtering.
   * The trigger endpoint handles filtering to only agents holding the ticker.
   */
  private async triggerAgents(signal: Signal) {
    const vercelUrl = this.room.env.VERCEL_URL as string | undefined;
    const webhookSecret = this.room.env.WEBHOOK_SECRET as string | undefined;

    if (!vercelUrl || !webhookSecret) {
      console.warn("[dflow-relay] Missing VERCEL_URL or WEBHOOK_SECRET");
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
          filterByPosition: true, // Only trigger agents holding this ticker
        }),
      });

      if (!response.ok) {
        console.error(
          `[dflow-relay] Failed to trigger agents: ${response.status}`,
        );
      } else {
        const result = (await response.json()) as {
          spawned: number;
          failed: number;
          message?: string;
        };
        if (result.spawned > 0) {
          console.log(
            `[dflow-relay] Triggered ${result.spawned} agent(s) for ${signal.ticker}`,
          );
        } else {
          console.log(
            `[dflow-relay] ${result.message || "No agents triggered"}`,
          );
        }
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
