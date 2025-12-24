// ============================================================================
// Price Service - WebSocket-based real-time price cache for dflow markets
// ============================================================================

const WS_URL = "wss://prediction-markets-api.dflow.net/api/v1/ws";

export interface MarketPrice {
  market_ticker: string;
  yes_bid: string | null;
  yes_ask: string | null;
  no_bid: string | null;
  no_ask: string | null;
  timestamp: number;
}

interface PriceServiceState {
  prices: Map<string, MarketPrice>;
  isConnected: boolean;
  lastUpdate: number;
}

class PriceService {
  private state: PriceServiceState = {
    prices: new Map(),
    isConnected: false,
    lastUpdate: 0,
  };
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private connecting = false;

  /**
   * Connect to the dflow WebSocket and start receiving price updates
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.connecting) {
      console.log("[PriceService] Already connected or connecting");
      return;
    }

    this.connecting = true;

    return new Promise((resolve, reject) => {
      console.log("[PriceService] Connecting to WebSocket:", WS_URL);

      try {
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
          console.log("[PriceService] WebSocket connected successfully");
          this.state.isConnected = true;
          this.reconnectAttempts = 0;
          this.connecting = false;

          // Subscribe to all prices
          this.ws?.send(
            JSON.stringify({
              type: "subscribe",
              channel: "prices",
              all: true,
            })
          );
          console.log("[PriceService] Subscribed to all prices");
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.channel === "prices" && data.type === "ticker") {
              this.state.prices.set(data.market_ticker, {
                market_ticker: data.market_ticker,
                yes_bid: data.yes_bid,
                yes_ask: data.yes_ask,
                no_bid: data.no_bid,
                no_ask: data.no_ask,
                timestamp: Date.now(),
              });
              this.state.lastUpdate = Date.now();
            }
          } catch (e) {
            console.error("[PriceService] Failed to parse message:", e);
          }
        };

        this.ws.onerror = (event) => {
          console.error("[PriceService] WebSocket error:", event);
          this.connecting = false;
          reject(new Error("WebSocket connection failed"));
        };

        this.ws.onclose = (event) => {
          console.log(
            "[PriceService] WebSocket closed:",
            event.code,
            event.reason
          );
          this.state.isConnected = false;
          this.ws = null;
          this.connecting = false;

          // Exponential backoff reconnection
          const delay = Math.min(
            1000 * Math.pow(2, this.reconnectAttempts),
            30000
          );
          this.reconnectAttempts++;
          console.log(
            `[PriceService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
          );
          this.reconnectTimeout = setTimeout(() => this.connect(), delay);
        };
      } catch (error) {
        console.error("[PriceService] Failed to create WebSocket:", error);
        this.connecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state.isConnected = false;
    this.connecting = false;
  }

  /**
   * Get price for a specific market
   */
  getPrice(ticker: string): MarketPrice | undefined {
    return this.state.prices.get(ticker);
  }

  /**
   * Get prices for multiple markets
   */
  getPrices(tickers: string[]): Map<string, MarketPrice> {
    const result = new Map<string, MarketPrice>();
    for (const ticker of tickers) {
      const price = this.state.prices.get(ticker);
      if (price) {
        result.set(ticker, price);
      }
    }
    return result;
  }

  /**
   * Get all available prices
   */
  getAllPrices(): MarketPrice[] {
    return Array.from(this.state.prices.values());
  }

  /**
   * Check if connected to WebSocket
   */
  isConnected(): boolean {
    return this.state.isConnected;
  }

  /**
   * Get the timestamp of the last price update
   */
  getLastUpdate(): number {
    return this.state.lastUpdate;
  }

  /**
   * Get the number of markets being tracked
   */
  getMarketCount(): number {
    return this.state.prices.size;
  }
}

// Singleton instance for server-side use
export const priceService = new PriceService();
