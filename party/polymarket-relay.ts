import type { Room, PartyKitServer, Connection } from "partykit/server";

const POLYMARKET_WS_URL =
  "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const RECONNECT_DELAY = 5000;

// ============================================================================
// Polymarket WebSocket Message Types
// ============================================================================

interface OrderSummary {
  price: string;
  size: string;
}

interface BookMessage {
  event_type: "book";
  asset_id: string;
  market: string;
  timestamp: string; // Unix milliseconds as string
  hash: string;
  bids: OrderSummary[]; // Best bids (buy orders)
  asks: OrderSummary[]; // Best asks (sell orders)
}

interface PriceChange {
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  hash: string;
  best_bid: string;
  best_ask: string;
}

interface PriceChangeMessage {
  event_type: "price_change";
  market: string;
  price_changes: PriceChange[];
  timestamp: string; // Unix milliseconds as string
}

interface LastTradePriceMessage {
  event_type: "last_trade_price";
  asset_id: string;
  market: string;
  price: string;
  side: "BUY" | "SELL";
  size: string;
  fee_rate_bps: string;
  timestamp: string; // Unix milliseconds as string
}

interface TickSizeChangeMessage {
  event_type: "tick_size_change";
  asset_id: string;
  market: string;
  old_tick_size: string;
  new_tick_size: string;
  timestamp: string;
}

interface BestBidAskMessage {
  event_type: "best_bid_ask";
  market: string;
  asset_id: string;
  best_bid: string;
  best_ask: string;
  spread: string;
  timestamp: string;
}

type PolymarketMessage =
  | BookMessage
  | PriceChangeMessage
  | LastTradePriceMessage
  | TickSizeChangeMessage
  | BestBidAskMessage;

// Normalized message format for clients (mirrors dflow-relay format)
interface NormalizedPriceMessage {
  channel: "prices";
  platform: "polymarket";
  asset_id: string;
  market: string;
  yes_price: string;
  no_price: string;
  best_bid: string | null;
  best_ask: string | null;
  timestamp: number;
}

// ============================================================================
// Client subscription message
// ============================================================================

interface SubscribeMessage {
  type: "subscribe";
  assets_ids: string[];
}

interface UnsubscribeMessage {
  type: "unsubscribe";
  assets_ids: string[];
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage;

// ============================================================================
// Polymarket Relay Server
// ============================================================================

export default class PolymarketRelay implements PartyKitServer {
  private polymarketWs: WebSocket | null = null;
  private subscribedAssets = new Set<string>();
  private clientSubscriptions = new Map<string, Set<string>>(); // connectionId -> asset_ids
  private initialSubscriptionSent = false; // Track if initial subscription was sent

  constructor(readonly room: Room) {}

  async onStart() {
    console.log("[polymarket-relay] Starting relay server");
    this.connectToPolymarket();
  }

  // Connect to Polymarket WebSocket (public, no auth required)
  private connectToPolymarket() {
    console.log("[polymarket-relay] Connecting to Polymarket WebSocket");

    try {
      const ws = new WebSocket(POLYMARKET_WS_URL);
      this.polymarketWs = ws;

      ws.addEventListener("open", () => {
        console.log("[polymarket-relay] Connected to Polymarket");
        this.initialSubscriptionSent = false; // Reset on new connection
        // Re-subscribe to all assets clients are interested in
        if (this.subscribedAssets.size > 0) {
          this.sendSubscription(Array.from(this.subscribedAssets));
        }
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        const raw = event.data as string;

        // Handle non-JSON acknowledgment responses from Polymarket
        if (
          raw === "NO NEW ASSETS" ||
          raw === "SUBSCRIBED" ||
          raw.startsWith("OK")
        ) {
          // Acknowledgment message, ignore
          return;
        }

        try {
          const data = JSON.parse(raw);
          // Polymarket can send arrays of messages
          const messages = Array.isArray(data) ? data : [data];
          for (const msg of messages) {
            this.handlePolymarketMessage(msg as PolymarketMessage);
          }
        } catch (error) {
          // Log unexpected non-JSON messages for debugging
          console.warn(
            `[polymarket-relay] Unexpected message format: ${raw.slice(0, 100)}`,
          );
        }
      });

      ws.addEventListener("close", () => {
        console.log(
          `[polymarket-relay] Connection closed, reconnecting in ${RECONNECT_DELAY}ms...`,
        );
        this.polymarketWs = null;
        setTimeout(() => this.connectToPolymarket(), RECONNECT_DELAY);
      });

      ws.addEventListener("error", (error: Event) => {
        console.error("[polymarket-relay] WebSocket error:", error);
      });
    } catch (error) {
      console.error("[polymarket-relay] Failed to connect:", error);
      setTimeout(() => this.connectToPolymarket(), RECONNECT_DELAY);
    }
  }

  // Send subscription to Polymarket
  private sendSubscription(assetIds: string[]) {
    if (!this.polymarketWs || this.polymarketWs.readyState !== WebSocket.OPEN) {
      return;
    }

    if (assetIds.length === 0) {
      return;
    }

    let msg: { assets_ids: string[]; type?: string; operation?: string };
    const isInitial = !this.initialSubscriptionSent;

    if (isInitial) {
      // Initial subscription includes type
      msg = {
        assets_ids: assetIds,
        type: "market",
      };
      this.initialSubscriptionSent = true;
    } else {
      // Dynamic subscription uses operation
      msg = {
        assets_ids: assetIds,
        operation: "subscribe",
      };
    }

    this.polymarketWs.send(JSON.stringify(msg));
    console.log(
      `[polymarket-relay] ${isInitial ? "Initial subscription" : "Subscribed"} to ${assetIds.length} assets`,
    );
  }

  // Handle incoming Polymarket messages
  private handlePolymarketMessage(msg: PolymarketMessage) {
    if (!msg.event_type) return;

    // Debug: log the raw asset_id from Polymarket
    if ("asset_id" in msg) {
      console.log(
        `[polymarket-relay] Received ${msg.event_type} for asset: ${msg.asset_id}`,
      );
    }

    switch (msg.event_type) {
      case "book": {
        this.handleBookMessage(msg);
        break;
      }
      case "price_change": {
        this.handlePriceChangeMessage(msg);
        break;
      }
      case "last_trade_price": {
        this.handleLastTradePriceMessage(msg);
        break;
      }
      case "best_bid_ask": {
        this.handleBestBidAskMessage(msg);
        break;
      }
      case "tick_size_change": {
        // Log tick size changes but don't broadcast
        console.log(
          `[polymarket-relay] Tick size changed for ${msg.asset_id}: ${msg.old_tick_size} -> ${msg.new_tick_size}`,
        );
        break;
      }
    }
  }

  // Handle book message (full orderbook snapshot)
  private handleBookMessage(msg: BookMessage) {
    if (!this.subscribedAssets.has(msg.asset_id)) return;

    // Extract best bid/ask from orderbook
    const bestBid = msg.bids?.[0]?.price || null;
    const bestAsk = msg.asks?.[0]?.price || null;

    // Parse prices safely, treating empty strings as null
    const bidValue = bestBid ? parseFloat(bestBid) : NaN;
    const askValue = bestAsk ? parseFloat(bestAsk) : NaN;

    let yesPrice: number | null = null;
    if (Number.isFinite(bidValue) && Number.isFinite(askValue)) {
      yesPrice = (bidValue + askValue) / 2;
    } else if (Number.isFinite(bidValue)) {
      yesPrice = bidValue;
    } else if (Number.isFinite(askValue)) {
      yesPrice = askValue;
    }

    if (yesPrice === null || !Number.isFinite(yesPrice)) return;

    this.broadcast(
      msg.asset_id,
      msg.market,
      yesPrice,
      bestBid,
      bestAsk,
      msg.timestamp,
    );
  }

  // Handle price_change message (array of price changes with best bid/ask)
  private handlePriceChangeMessage(msg: PriceChangeMessage) {
    // price_change now contains an array of price_changes
    for (const change of msg.price_changes) {
      if (!this.subscribedAssets.has(change.asset_id)) continue;

      // Use best_bid/best_ask from the change to calculate mid price
      const bestBid = change.best_bid || null;
      const bestAsk = change.best_ask || null;

      // Parse prices safely, treating empty strings as NaN
      const bidValue = bestBid ? parseFloat(bestBid) : NaN;
      const askValue = bestAsk ? parseFloat(bestAsk) : NaN;
      const priceValue = change.price ? parseFloat(change.price) : NaN;

      let yesPrice: number | null = null;
      if (Number.isFinite(bidValue) && Number.isFinite(askValue)) {
        yesPrice = (bidValue + askValue) / 2;
      } else if (Number.isFinite(priceValue)) {
        yesPrice = priceValue;
      }

      if (yesPrice === null || !Number.isFinite(yesPrice)) continue;

      this.broadcast(
        change.asset_id,
        msg.market,
        yesPrice,
        bestBid,
        bestAsk,
        msg.timestamp,
      );
    }
  }

  // Handle last_trade_price message (trade execution)
  private handleLastTradePriceMessage(msg: LastTradePriceMessage) {
    if (!this.subscribedAssets.has(msg.asset_id)) return;

    const yesPrice = msg.price ? parseFloat(msg.price) : NaN;

    if (!Number.isFinite(yesPrice)) return;

    this.broadcast(
      msg.asset_id,
      msg.market,
      yesPrice,
      null,
      null,
      msg.timestamp,
    );
  }

  // Handle best_bid_ask message (direct bid/ask updates)
  private handleBestBidAskMessage(msg: BestBidAskMessage) {
    if (!this.subscribedAssets.has(msg.asset_id)) return;

    const bestBid = msg.best_bid || null;
    const bestAsk = msg.best_ask || null;

    // Parse prices safely
    const bidValue = bestBid ? parseFloat(bestBid) : NaN;
    const askValue = bestAsk ? parseFloat(bestAsk) : NaN;

    let yesPrice: number | null = null;
    if (Number.isFinite(bidValue) && Number.isFinite(askValue)) {
      yesPrice = (bidValue + askValue) / 2;
    }

    if (yesPrice === null || !Number.isFinite(yesPrice)) return;

    this.broadcast(
      msg.asset_id,
      msg.market,
      yesPrice,
      bestBid,
      bestAsk,
      msg.timestamp,
    );
  }

  // Broadcast normalized price message to clients
  private broadcast(
    assetId: string,
    market: string,
    yesPrice: number,
    bestBid: string | null,
    bestAsk: string | null,
    timestamp: string,
  ) {
    const normalized: NormalizedPriceMessage = {
      channel: "prices",
      platform: "polymarket",
      asset_id: assetId,
      market: market,
      yes_price: yesPrice.toFixed(4),
      no_price: (1 - yesPrice).toFixed(4),
      best_bid: bestBid,
      best_ask: bestAsk,
      timestamp: parseInt(timestamp, 10) || Date.now(),
    };

    console.log(
      `[polymarket-relay] Broadcasting price: ${assetId.slice(0, 8)}... yes=${normalized.yes_price} no=${normalized.no_price}`,
    );
    this.room.broadcast(JSON.stringify(normalized));
  }

  // Update subscriptions based on connected clients
  private updateSubscriptions() {
    const allAssets = new Set<string>();
    for (const assets of this.clientSubscriptions.values()) {
      for (const asset of assets) {
        allAssets.add(asset);
      }
    }

    // Find new assets to subscribe to
    const newAssets = Array.from(allAssets).filter(
      (a) => !this.subscribedAssets.has(a),
    );

    // Update our tracked set
    this.subscribedAssets = allAssets;

    // Subscribe to new assets if connected
    if (newAssets.length > 0) {
      this.sendSubscription(newAssets);
    }
  }

  // Handle client connections
  onConnect(conn: Connection) {
    console.log(`[polymarket-relay] Client connected: ${conn.id}`);
    this.clientSubscriptions.set(conn.id, new Set());
  }

  // Handle client messages (subscription requests)
  onMessage(
    message: string | ArrayBuffer | ArrayBufferView,
    sender: Connection,
  ) {
    try {
      const messageStr =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      const msg = JSON.parse(messageStr) as ClientMessage;

      if (msg.type === "subscribe" && Array.isArray(msg.assets_ids)) {
        const clientAssets =
          this.clientSubscriptions.get(sender.id) || new Set();
        for (const assetId of msg.assets_ids) {
          clientAssets.add(assetId);
        }
        this.clientSubscriptions.set(sender.id, clientAssets);
        this.updateSubscriptions();
        console.log(
          `[polymarket-relay] Client ${sender.id} subscribed to ${msg.assets_ids.length} assets`,
        );
        // Debug: log first few asset IDs
        console.log(
          `[polymarket-relay] Sample subscribed IDs: ${msg.assets_ids
            .slice(0, 3)
            .map((id: string) => id.slice(0, 20) + "...")
            .join(", ")}`,
        );
      }

      if (msg.type === "unsubscribe" && Array.isArray(msg.assets_ids)) {
        const clientAssets = this.clientSubscriptions.get(sender.id);
        if (clientAssets) {
          for (const assetId of msg.assets_ids) {
            clientAssets.delete(assetId);
          }
          this.updateSubscriptions();
        }
      }
    } catch (error) {
      console.error(
        "[polymarket-relay] Failed to parse client message:",
        error,
      );
    }
  }

  onClose(conn: Connection) {
    console.log(`[polymarket-relay] Client disconnected: ${conn.id}`);
    this.clientSubscriptions.delete(conn.id);
    this.updateSubscriptions();
  }
}
