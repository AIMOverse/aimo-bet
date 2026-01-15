"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import PartySocket from "partysocket";

// ============================================================================
// Constants
// ============================================================================

const DIRECTION_FLASH_DURATION = 1000; // 1 second
const POLYMARKET_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

// ============================================================================
// Types
// ============================================================================

export interface PriceUpdate {
  ticker: string;
  yesPrice: number;
  noPrice: number;
  timestamp: number;
}

export type PriceDirection = "up" | "down" | "neutral";

export interface UsePriceSubscriptionReturn {
  prices: Map<string, PriceUpdate>;
  priceDirection: Map<string, PriceDirection>;
  isConnected: { kalshi: boolean; polymarket: boolean };
  error?: Error;
}

type Platform = "kalshi" | "polymarket";

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Detect platform from ticker format.
 * Polymarket token IDs are very long numeric strings (77+ digits).
 * Kalshi tickers are short alphanumeric (e.g., KXFEDCHAIRNOM-29-KH).
 */
export function detectPlatform(ticker: string): Platform {
  return /^\d{50,}$/.test(ticker) ? "polymarket" : "kalshi";
}

// ============================================================================
// Hook
// ============================================================================

export function usePriceSubscription(
  tickers: string[]
): UsePriceSubscriptionReturn {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
  const [priceDirection, setPriceDirection] = useState<
    Map<string, PriceDirection>
  >(new Map());
  const [kalshiConnected, setKalshiConnected] = useState(false);
  const [polymarketConnected, setPolymarketConnected] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------
  const kalshiSocketRef = useRef<PartySocket | null>(null);
  const polymarketSocketRef = useRef<WebSocket | null>(null);
  const directionTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const reconnectAttempts = useRef<{ kalshi: number; polymarket: number }>({
    kalshi: 0,
    polymarket: 0,
  });

  // -------------------------------------------------------------------------
  // Separate tickers by platform
  // -------------------------------------------------------------------------
  const { kalshiTickers, polymarketTickers } = useMemo(() => {
    const kalshi: string[] = [];
    const polymarket: string[] = [];

    for (const ticker of tickers) {
      if (detectPlatform(ticker) === "polymarket") {
        polymarket.push(ticker);
      } else {
        kalshi.push(ticker);
      }
    }

    return { kalshiTickers: kalshi, polymarketTickers: polymarket };
  }, [tickers]);

  // Create stable ticker sets for message filtering
  const kalshiTickerSet = useMemo(
    () => new Set(kalshiTickers),
    [kalshiTickers]
  );
  const polymarketTickerSet = useMemo(
    () => new Set(polymarketTickers),
    [polymarketTickers]
  );

  // -------------------------------------------------------------------------
  // Price Update Handler (shared between platforms)
  // -------------------------------------------------------------------------
  const updatePrice = useCallback(
    (ticker: string, yesPrice: number, noPrice: number) => {
      const now = Date.now();

      setPrices((prev) => {
        const existing = prev.get(ticker);
        const newPrices = new Map(prev);

        // Calculate direction if we have a previous price
        if (existing) {
          const oldMid = (existing.yesPrice + existing.noPrice) / 2;
          const newMid = (yesPrice + noPrice) / 2;

          let direction: PriceDirection = "neutral";
          if (newMid > oldMid) direction = "up";
          else if (newMid < oldMid) direction = "down";

          if (direction !== "neutral") {
            setPriceDirection((dirPrev) =>
              new Map(dirPrev).set(ticker, direction)
            );

            // Clear existing timeout
            const existingTimeout = directionTimeouts.current.get(ticker);
            if (existingTimeout) clearTimeout(existingTimeout);

            // Set timeout to clear direction after flash
            directionTimeouts.current.set(
              ticker,
              setTimeout(() => {
                setPriceDirection((dirPrev) => {
                  const next = new Map(dirPrev);
                  next.delete(ticker);
                  return next;
                });
                directionTimeouts.current.delete(ticker);
              }, DIRECTION_FLASH_DURATION)
            );
          }
        }

        newPrices.set(ticker, {
          ticker,
          yesPrice,
          noPrice,
          timestamp: now,
        });

        return newPrices;
      });
    },
    []
  );

  // -------------------------------------------------------------------------
  // Kalshi WebSocket (via PartyKit dflow-relay)
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Skip if no tickers to subscribe to
    if (kalshiTickerSet.size === 0) {
      return;
    }

    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    if (!host) {
      console.warn(
        "[usePriceSubscription] NEXT_PUBLIC_PARTYKIT_HOST not set"
      );
      return;
    }

    const socket = new PartySocket({
      host,
      room: "dflow-relay",
    });

    kalshiSocketRef.current = socket;

    socket.onopen = () => {
      console.log("[usePriceSubscription] Kalshi WebSocket connected");
      setKalshiConnected(true);
      reconnectAttempts.current.kalshi = 0;
    };

    socket.onclose = () => {
      console.log("[usePriceSubscription] Kalshi WebSocket disconnected");
      setKalshiConnected(false);
    };

    socket.onerror = (err) => {
      console.error("[usePriceSubscription] Kalshi WebSocket error:", err);
      setError(new Error("Kalshi WebSocket connection failed"));
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);

        // Only process price messages for our subscribed tickers
        if (msg.channel !== "prices") return;
        if (!kalshiTickerSet.has(msg.market_ticker)) return;

        const yesBid = msg.yes_bid ? parseFloat(msg.yes_bid) : 0;
        const yesAsk = msg.yes_ask ? parseFloat(msg.yes_ask) : 0;
        const noBid = msg.no_bid ? parseFloat(msg.no_bid) : 0;
        const noAsk = msg.no_ask ? parseFloat(msg.no_ask) : 0;

        // Use mid prices
        const yesPrice = (yesBid + yesAsk) / 2;
        const noPrice = (noBid + noAsk) / 2;

        updatePrice(msg.market_ticker, yesPrice, noPrice);
      } catch (err) {
        console.error(
          "[usePriceSubscription] Failed to parse Kalshi message:",
          err
        );
      }
    };

    return () => {
      socket.close();
      kalshiSocketRef.current = null;
      setKalshiConnected(false);
    };
  }, [kalshiTickerSet, updatePrice]);

  // -------------------------------------------------------------------------
  // Polymarket WebSocket (direct connection)
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Skip if no tickers to subscribe to
    if (polymarketTickerSet.size === 0) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      socket = new WebSocket(POLYMARKET_WS_URL);
      polymarketSocketRef.current = socket;

      socket.onopen = () => {
        console.log("[usePriceSubscription] Polymarket WebSocket connected");
        setPolymarketConnected(true);
        reconnectAttempts.current.polymarket = 0;

        // Subscribe to market channel with our token IDs
        const subscribeMsg = {
          type: "market",
          assets_ids: Array.from(polymarketTickerSet),
        };
        socket?.send(JSON.stringify(subscribeMsg));
      };

      socket.onclose = () => {
        console.log("[usePriceSubscription] Polymarket WebSocket disconnected");
        setPolymarketConnected(false);

        // Reconnect with exponential backoff
        const attempt = reconnectAttempts.current.polymarket;
        const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
        reconnectAttempts.current.polymarket = attempt + 1;

        console.log(
          `[usePriceSubscription] Polymarket reconnecting in ${delay}ms (attempt ${attempt + 1})`
        );
        reconnectTimeout = setTimeout(connect, delay);
      };

      socket.onerror = (err) => {
        console.error("[usePriceSubscription] Polymarket WebSocket error:", err);
        setError(new Error("Polymarket WebSocket connection failed"));
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const msgs = JSON.parse(event.data as string);

          // Polymarket sends arrays of messages
          const msgArray = Array.isArray(msgs) ? msgs : [msgs];

          for (const msg of msgArray) {
            // Handle price_change events
            if (msg.event_type === "price_change" && msg.asset_id) {
              if (!polymarketTickerSet.has(msg.asset_id)) continue;

              // Polymarket price is 0-1 for the token
              const price = parseFloat(msg.price || "0");
              // YES token price is the price, NO token price is 1 - price
              updatePrice(msg.asset_id, price, 1 - price);
            }

            // Handle book events with best bid/ask
            if (msg.event_type === "book" && msg.asset_id) {
              if (!polymarketTickerSet.has(msg.asset_id)) continue;

              const bestBid = parseFloat(msg.bids?.[0]?.price || "0");
              const bestAsk = parseFloat(msg.asks?.[0]?.price || "1");
              const midPrice = (bestBid + bestAsk) / 2;

              updatePrice(msg.asset_id, midPrice, 1 - midPrice);
            }
          }
        } catch (err) {
          console.error(
            "[usePriceSubscription] Failed to parse Polymarket message:",
            err
          );
        }
      };
    };

    connect();

    // Copy ref value for cleanup function
    const timeouts = directionTimeouts.current;

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        socket.close();
        polymarketSocketRef.current = null;
      }
      setPolymarketConnected(false);
      // Clear all direction timeouts
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
    };
  }, [polymarketTickerSet, updatePrice]);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------
  return {
    prices,
    priceDirection,
    isConnected: {
      kalshi: kalshiConnected,
      polymarket: polymarketConnected,
    },
    error,
  };
}
