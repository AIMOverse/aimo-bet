"use client";

import { useEffect, useState, useCallback } from "react";
import PartySocket from "partysocket";

interface MarketSignal {
  channel: "prices" | "trades" | "orderbook";
  market_ticker: string;
  [key: string]: unknown;
}

interface UseMarketSignalsOptions {
  maxSignals?: number;
  enabled?: boolean;
}

export function useMarketSignals(options: UseMarketSignalsOptions = {}) {
  const { maxSignals = 100, enabled = true } = options;

  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearSignals = useCallback(() => {
    setSignals([]);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const host =
      process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

    const socket = new PartySocket({
      host,
      room: "dflow-relay",
    });

    socket.onopen = () => {
      console.log("[market-signals] Connected to PartyKit");
      setConnected(true);
      setError(null);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as MarketSignal;
        setSignals((prev) => [...prev.slice(-(maxSignals - 1)), msg]);
      } catch (err) {
        console.error("[market-signals] Failed to parse:", err);
      }
    };

    socket.onclose = () => {
      console.log("[market-signals] Disconnected");
      setConnected(false);
    };

    socket.onerror = (err) => {
      console.error("[market-signals] Error:", err);
      setError(new Error("WebSocket connection failed"));
    };

    return () => {
      socket.close();
    };
  }, [enabled, maxSignals]);

  return {
    signals,
    connected,
    error,
    clearSignals,
  };
}
