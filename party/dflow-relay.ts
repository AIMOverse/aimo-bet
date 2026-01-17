import type {
  Room,
  PartyKitServer,
  Connection,
  Request as PartyRequest,
} from "partykit/server";

// Cloudflare Workers WebSocket with accept() method for server-side connections
interface CFWebSocket extends WebSocket {
  accept(): void;
}

// Cloudflare Workers Response type with WebSocket upgrade support
interface CFWebSocketResponse extends Response {
  webSocket: CFWebSocket | null;
}

const DFLOW_WS_URL = "wss://prediction-markets-api.dflow.net/api/v1/ws";
const RECONNECT_DELAY = 5000;

// Position flip detection thresholds (hysteresis)
const FLIP_UPPER_THRESHOLD = 0.52; // Above this = YES-favored
const FLIP_LOWER_THRESHOLD = 0.48; // Below this = NO-favored
const FLIP_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per market

type PositionState = "yes_favored" | "no_favored" | "neutral";

interface PriceMessage {
  channel: "prices";
  type: "ticker";
  market_ticker: string;
  yes_bid: string | null;
  yes_ask: string | null;
  no_bid: string | null;
  no_ask: string | null;
}

interface PositionFlipSignal {
  type: "position_flip";
  ticker: string;
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

// Client subscription message
interface ClientSubscribeMessage {
  type: "subscribe" | "unsubscribe";
  tickers: string[];
}

export default class DflowRelay implements PartyKitServer {
  private dflowWs: WebSocket | null = null;

  // Price tracking (for flip detection)
  private priceCache = new Map<string, number>();
  private positionStates = new Map<string, PositionState>();
  private flipCooldowns = new Map<string, number>(); // ticker -> last flip timestamp

  // Subscription tracking (mirrors polymarket-relay pattern)
  private subscribedTickers = new Set<string>();
  private clientSubscriptions = new Map<string, Set<string>>(); // connId -> tickers
  private agentMarkets = new Set<string>();
  private agentMarketRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly AGENT_MARKET_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min backup

  constructor(readonly room: Room) {}

  // Called when the room is created
  async onStart() {
    console.log("[dflow-relay] Starting relay server");
    await this.refreshAgentMarkets();
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
        setTimeout(() => this.connectToDflow(), RECONNECT_DELAY);
        return;
      }

      // Accept the WebSocket connection (required for Cloudflare Workers WebSockets)
      ws.accept();
      this.dflowWs = ws as unknown as WebSocket;

      console.log("[dflow-relay] Connected to dflow");

      // Subscribe to current markets (if any)
      this.subscribeToCurrentMarkets();

      // Start periodic refresh
      this.startAgentMarketRefreshInterval();

      // Set up event handlers
      this.dflowWs.addEventListener("message", (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as PriceMessage;
          this.handleDflowMessage(msg);
        } catch (error) {
          console.error("[dflow-relay] Failed to parse message:", error);
        }
      });

      this.dflowWs.addEventListener("close", () => {
        console.log(
          "[dflow-relay] Connection closed, reconnecting in 5s...",
        );
        this.dflowWs = null;
        setTimeout(() => this.connectToDflow(), RECONNECT_DELAY);
      });

      this.dflowWs.addEventListener("error", (error: Event) => {
        console.error("[dflow-relay] WebSocket error:", error);
      });
    } catch (error) {
      console.error("[dflow-relay] Failed to connect:", error);
      setTimeout(() => this.connectToDflow(), RECONNECT_DELAY);
    }
  }

  /**
   * Subscribe to all currently tracked markets (union of client + agent markets).
   */
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

  /**
   * Send subscription request to dflow for specific tickers.
   */
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
      }),
    );

    console.log(`[dflow-relay] Subscribed to ${tickers.length} markets`);
  }

  // Helper to determine position state from price
  private getPositionState(price: number): PositionState {
    if (price > FLIP_UPPER_THRESHOLD) return "yes_favored";
    if (price < FLIP_LOWER_THRESHOLD) return "no_favored";
    return "neutral";
  }

  // Detect position flip (price crossing 50% threshold with hysteresis)
  private detectPositionFlip(msg: PriceMessage): PositionFlipSignal | null {
    const yesBid = msg.yes_bid ? parseFloat(msg.yes_bid) : null;
    const yesAsk = msg.yes_ask ? parseFloat(msg.yes_ask) : null;

    if (yesBid === null || yesAsk === null) return null;

    const currentPrice = (yesBid + yesAsk) / 2;
    const currentState = this.getPositionState(currentPrice);
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
        return null; // Still in cooldown
      }

      // Record flip time
      this.flipCooldowns.set(msg.market_ticker, Date.now());

      const previousPrice =
        this.priceCache.get(msg.market_ticker) || currentPrice;

      console.log(
        `[dflow-relay] Position flip detected: ${msg.market_ticker} ` +
          `${previousState} -> ${currentState} (${previousPrice.toFixed(3)} -> ${currentPrice.toFixed(3)})`,
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
          flipDirection:
            currentState === "no_favored" ? "yes_to_no" : "no_to_yes",
        },
        timestamp: Date.now(),
      };
    }

    // Update price cache
    this.priceCache.set(msg.market_ticker, currentPrice);

    return null;
  }

  // Handle incoming dflow messages (prices only)
  private handleDflowMessage(msg: PriceMessage) {
    // Only handle price messages
    if (msg.channel !== "prices") return;

    // Check for position flip
    const flipSignal = this.detectPositionFlip(msg);
    if (flipSignal) {
      this.triggerAgentsWithFlip(flipSignal);
    }

    // Broadcast to connected frontend clients
    this.room.broadcast(JSON.stringify(msg));
  }

  /**
   * Trigger agents via Vercel API for position flip signals.
   */
  private async triggerAgentsWithFlip(signal: PositionFlipSignal) {
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
          filterByPosition: true,
        }),
      });

      if (!response.ok) {
        console.error(
          `[dflow-relay] Failed to trigger agents for flip: ${response.status}`,
        );
      } else {
        const result = (await response.json()) as {
          spawned: number;
          failed: number;
          message?: string;
        };
        if (result.spawned > 0) {
          console.log(
            `[dflow-relay] Position flip triggered ${result.spawned} agent(s) for ${signal.ticker}`,
          );
        }
      }
    } catch (error) {
      console.error("[dflow-relay] Error triggering agents for flip:", error);
    }
  }

  /**
   * Fetch all dflow markets any agent holds and subscribe to them.
   */
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
        },
      );

      if (!response.ok) {
        console.error(
          `[dflow-relay] Failed to fetch agent markets: ${response.status}`,
        );
        return;
      }

      const { markets } = (await response.json()) as { markets: string[] };

      const newMarkets = markets.filter((m) => !this.agentMarkets.has(m));

      this.agentMarkets = new Set(markets);

      if (newMarkets.length > 0 && this.dflowWs?.readyState === WebSocket.OPEN) {
        this.sendSubscription(newMarkets);
        console.log(
          `[dflow-relay] Subscribed to ${newMarkets.length} agent-held markets`,
        );
      }

      console.log(`[dflow-relay] Tracking ${markets.length} agent-held markets`);
    } catch (error) {
      console.error("[dflow-relay] Error refreshing agent markets:", error);
    }
  }

  /**
   * Start periodic refresh of agent markets as a backup.
   */
  private startAgentMarketRefreshInterval() {
    if (this.agentMarketRefreshTimer) {
      clearInterval(this.agentMarketRefreshTimer);
    }

    this.agentMarketRefreshTimer = setInterval(() => {
      this.refreshAgentMarkets();
    }, this.AGENT_MARKET_REFRESH_INTERVAL);
  }

  /**
   * Update subscriptions based on all tracked sources (clients + agents).
   */
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
      (t) => !this.subscribedTickers.has(t),
    );

    this.subscribedTickers = allTickers;

    if (newTickers.length > 0) {
      this.sendSubscription(newTickers);
    }
  }

  /**
   * Handle HTTP requests for real-time market subscription updates.
   * Called by trading workflow when agent opens a new position.
   */
  async onRequest(req: PartyRequest): Promise<Response> {
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
              `[dflow-relay] Real-time subscribed to ${newMarkets.length} new markets`,
            );
          }
        }

        return new Response(
          JSON.stringify({ success: true, subscribed: newMarkets.length }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("Invalid request type", { status: 400 });
    } catch (error) {
      console.error("[dflow-relay] HTTP handler error:", error);
      return new Response("Internal error", { status: 500 });
    }
  }

  // Handle frontend client connections
  onConnect(conn: Connection) {
    console.log(`[dflow-relay] Client connected: ${conn.id}`);
    this.clientSubscriptions.set(conn.id, new Set());
  }

  // Handle client messages (subscription requests from frontend)
  onMessage(
    message: string | ArrayBuffer | ArrayBufferView,
    sender: Connection,
  ) {
    try {
      const messageStr =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      const msg = JSON.parse(messageStr) as ClientSubscribeMessage;

      if (msg.type === "subscribe" && Array.isArray(msg.tickers)) {
        const clientTickers =
          this.clientSubscriptions.get(sender.id) || new Set();
        for (const ticker of msg.tickers) {
          clientTickers.add(ticker);
        }
        this.clientSubscriptions.set(sender.id, clientTickers);
        this.updateSubscriptions();
        console.log(
          `[dflow-relay] Client ${sender.id} subscribed to ${msg.tickers.length} markets`,
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

  onClose(conn: Connection) {
    console.log(`[dflow-relay] Client disconnected: ${conn.id}`);
    this.clientSubscriptions.delete(conn.id);
    this.updateSubscriptions();
  }
}
