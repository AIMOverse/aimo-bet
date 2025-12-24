"use client";

import { useState, useEffect, useRef } from "react";

export interface MarketPrice {
  market_ticker: string;
  yes_bid: string | null;
  yes_ask: string | null;
  no_bid: string | null;
  no_ask: string | null;
}

interface UseMarketPricesReturn {
  prices: Map<string, MarketPrice>;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

const WS_URL = "wss://prediction-markets-api.dflow.net/api/v1/ws";

export function useMarketPrices(): UseMarketPricesReturn {
  const [prices, setPrices] = useState<Map<string, MarketPrice>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      console.log("[MarketPrices] Connecting to WebSocket:", WS_URL);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[MarketPrices] WebSocket connected successfully");
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;

        // Subscribe to all prices
        ws.send(
          JSON.stringify({
            type: "subscribe",
            channel: "prices",
            all: true,
          }),
        );
        console.log("[MarketPrices] Subscribed to all prices");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.channel === "prices" && data.type === "ticker") {
            setIsLoading(false);
            setPrices((prev) => {
              const next = new Map(prev);
              next.set(data.market_ticker, {
                market_ticker: data.market_ticker,
                yes_bid: data.yes_bid,
                yes_ask: data.yes_ask,
                no_bid: data.no_bid,
                no_ask: data.no_ask,
              });
              return next;
            });
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };

      ws.onerror = (event) => {
        console.error("[MarketPrices] WebSocket error:", event);
        setError("WebSocket error");
      };

      ws.onclose = (event) => {
        console.log(
          "[MarketPrices] WebSocket closed:",
          event.code,
          event.reason,
        );
        setIsConnected(false);
        wsRef.current = null;

        // Exponential backoff reconnection
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttempts.current),
          30000,
        );
        reconnectAttempts.current++;
        console.log(
          `[MarketPrices] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`,
        );
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { prices, isConnected, isLoading, error };
}
